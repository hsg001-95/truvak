import requests
import os
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

STORE_URL   = os.getenv("SHOPIFY_STORE_URL")
TOKEN       = os.getenv("SHOPIFY_ACCESS_TOKEN")
API_VERSION = os.getenv("SHOPIFY_API_VERSION", "2024-01")
MERCHANT_ID = os.getenv("MERCHANT_ID", "trust-intelligence-dev")
SCORING_API_URL = os.getenv("SCORING_API_URL", "http://127.0.0.1:8000")

HEADERS = {
    "X-Shopify-Access-Token": TOKEN,
    "Content-Type": "application/json"
}

BASE_URL = f"https://{STORE_URL}/admin/api/{API_VERSION}"

# ── PIN tier lookup ───────────────────────────────────────────────────────────
PIN_TIER_MAP = {
    "110": 1, "400": 1, "560": 1, "600": 1, "500": 1, "700": 1,
    "226": 2, "302": 2, "380": 2, "411": 2, "452": 2, "440": 2,
    "828": 3, "845": 3, "743": 3, "535": 3, "494": 3, "814": 3,
}

def get_pin_tier(pin_code: str) -> int:
    if not pin_code:
        return 2
    return PIN_TIER_MAP.get(str(pin_code)[:3], 2)

# ── Fetch orders from Shopify ─────────────────────────────────────────────────
def fetch_orders(limit: int = 50, status: str = "any") -> list:
    """Fetch recent orders from Shopify store."""
    r = requests.get(
        f"{BASE_URL}/orders.json",
        headers=HEADERS,
        params={"limit": limit, "status": status},
        timeout=20,
    )
    if r.status_code != 200:
        print(f"Error fetching orders: {r.status_code} {r.text}")
        return []
    return r.json().get("orders", [])

# ── Map Shopify order → our feature schema ────────────────────────────────────
def map_order_to_features(order: dict) -> dict:
    """
    Convert a raw Shopify order dict into the feature schema
    our /score endpoint expects.
    """
    # Payment method → COD proxy
    gateway = order.get("gateway", "").lower()
    payment_method = order.get("payment_gateway_names", [])
    is_cod = int(
        "cod"          in gateway or
        "cash"         in gateway or
        "manual"       in gateway or
        any("cod" in p.lower() or "cash" in p.lower()
            for p in payment_method)
    )

    # Customer details
    customer    = order.get("customer") or {}
    shipping    = order.get("shipping_address") or {}
    billing     = order.get("billing_address") or {}

    # Buyer identifier — use email or phone, never stored raw
    raw_buyer_id = (
        customer.get("email") or
        customer.get("phone") or
        shipping.get("phone") or
        f"shopify_customer_{customer.get('id', 'unknown')}"
    )

    # PIN code — from shipping address
    pin_code = (
        shipping.get("zip") or
        billing.get("zip") or
        "000000"
    )

    # Order value
    order_value = float(order.get("total_price", 0))

    # Item count
    item_count = sum(
        item.get("quantity", 1)
        for item in order.get("line_items", [])
    )

    # Order month
    created_at   = order.get("created_at", "")
    order_month  = datetime.fromisoformat(
        created_at.replace("Z", "+00:00")
    ).month if created_at else datetime.now().month

    return {
        "order_id":     str(order.get("id")),
        "raw_buyer_id": raw_buyer_id,
        "merchant_id":  MERCHANT_ID,
        "order_value":  order_value,
        "is_cod":       is_cod,
        "pin_code":     str(pin_code),
        "item_count":   item_count,
        "installments": 1,
        "order_month":  order_month,
        # Metadata (not sent to score endpoint, used for display)
        "_shopify_order_number": order.get("name"),
        "_customer_name": (
            f"{customer.get('first_name','')} "
            f"{customer.get('last_name','')}".strip()
            or "Guest"
        ),
        "_financial_status": order.get("financial_status"),
        "_fulfillment_status": order.get("fulfillment_status"),
    }

# ── Score a single Shopify order ──────────────────────────────────────────────
def score_shopify_order(order: dict, api_url: str = SCORING_API_URL) -> dict:
    """Map order features and call our /score endpoint."""
    features = map_order_to_features(order)

    # Strip metadata before sending to API
    payload = {k: v for k, v in features.items() if not k.startswith("_")}

    try:
        r = requests.post(
            f"{api_url}/v1/score",
            json=payload,
            timeout=5
        )
        if r.status_code == 200:
            result = r.json()
            # Merge metadata back for display
            result["shopify_order_number"] = features["_shopify_order_number"]
            result["customer_name"]        = features["_customer_name"]
            result["financial_status"]     = features["_financial_status"]
            result["fulfillment_status"]   = features["_fulfillment_status"]
            result["is_cod"]               = features["is_cod"]
            result["order_value"]          = features["order_value"]
            result["pin_code"]             = features["pin_code"]
            return result
        else:
            return {
                "error": f"API error {r.status_code}: {r.text}",
                "order_id": features["order_id"],
            }
    except Exception as e:
        return {
            "error": f"Could not reach scoring API at {api_url}: {e}",
            "order_id": features["order_id"],
        }

# ── Sync all recent orders ─────────────────────────────────────────────────────
def sync_and_score_all(limit: int = 50) -> list:
    """Fetch all recent Shopify orders and score each one."""
    print(f"Fetching orders from {STORE_URL}...")
    orders = fetch_orders(limit=limit)
    print(f"Found {len(orders)} orders")

    results = []
    for order in orders:
        result = score_shopify_order(order)
        results.append(result)
        status = result.get("risk_level", "ERROR")
        score  = result.get("score", "N/A")
        name   = result.get("shopify_order_number", "?")
        print(f"  {name} → Score: {score} | Risk: {status}")

    return results

# ── Add webhook to Shopify ────────────────────────────────────────────────────
def register_webhook(ngrok_url: str, topic: str = "orders/create") -> bool:
    """Register a webhook so Shopify notifies us on new orders."""
    payload = {
        "webhook": {
            "topic":   topic,
            "address": f"{ngrok_url}/v1/shopify/webhook",
            "format":  "json"
        }
    }
    r = requests.post(
        f"{BASE_URL}/webhooks.json",
        headers=HEADERS,
        json=payload
    )
    if r.status_code in (200, 201):
        print(f"Webhook registered: {topic} → {ngrok_url}/v1/shopify/webhook")
        return True
    else:
        print(f"Webhook failed: {r.status_code} {r.text}")
        return False

def list_webhooks() -> list:
    r = requests.get(f"{BASE_URL}/webhooks.json", headers=HEADERS)
    return r.json().get("webhooks", [])


if __name__ == "__main__":
    print("=== Shopify Integration Test ===\n")

    # Test 1: fetch orders
    orders = fetch_orders(limit=10)
    print(f"Orders found: {len(orders)}")

    if orders:
        # Test 2: map first order
        features = map_order_to_features(orders[0])
        print(f"\nFirst order mapped:")
        for k, v in features.items():
            print(f"  {k}: {v}")

        # Test 3: score it
        print(f"\nScoring first order...")
        result = score_shopify_order(orders[0])
        if "error" in result:
            print(f"  Error  : {result['error']}")
            print(f"  Hint   : Start the API with 'uvicorn backend.main:app --reload'")
        else:
            print(f"  Score  : {result.get('score')}")
            print(f"  Risk   : {result.get('risk_level')}")
            print(f"  Action : {result.get('recommended_action')}")
            print(f"  Factors: {result.get('factors')}")
    else:
        print("\nNo orders yet — create some test orders in Shopify admin first")
        print("https://trust-intelligence-dev.myshopify.com/admin/orders/new")
