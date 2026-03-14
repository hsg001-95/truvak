import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel, Field
from typing import Optional, List
import pickle
import pandas as pd
import numpy as np

from backend.db import init_db, get_connection
from backend.privacy import hash_buyer_id
from backend.rule_engine import RuleEngine, Rule

import hmac
import hashlib
import json
from fastapi import Request, BackgroundTasks

# Load Census PIN feature map
PIN_FEATURE_JSON = os.path.join(
    os.path.dirname(__file__), '..', 'data', 'pin_feature_map.json'
)
PIN_FEATURE_MAP  = {}
if os.path.exists(PIN_FEATURE_JSON):
    with open(PIN_FEATURE_JSON) as f:
        PIN_FEATURE_MAP = json.load(f)
    print(f"Census features loaded: {len(PIN_FEATURE_MAP):,} PINs")

NATIONAL_FALLBACK = {
    "internet_penetration": 0.0083,
    "mobile_penetration":   0.3861,
    "electricity_access":   0.5105,
    "cod_risk_score":       0.7903,
}

def get_pin_features(pin_code: str) -> dict:
    pin = str(pin_code).strip().zfill(6)
    return PIN_FEATURE_MAP.get(pin, NATIONAL_FALLBACK)

# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Trust Intelligence Platform API",
    description="RTO risk scoring for marketplace sellers",
    version="0.1.0"
)

# ── Load model on startup ─────────────────────────────────────────────────────
MODEL_PATH = os.path.join(os.path.dirname(__file__), '..', 'ml', 'rto_model_v1.pkl')
with open(MODEL_PATH, 'rb') as f:
    model_data = pickle.load(f)

MODEL    = model_data["model"]
FEATURES = model_data["features"]

# ── Rule engine (default rules loaded once) ───────────────────────────────────
engine = RuleEngine()
engine.load_defaults()

# ── PIN tier lookup ───────────────────────────────────────────────────────────
# Load full India PIN tier map at startup
PIN_TIER_JSON_PATH = os.path.join(
    os.path.dirname(__file__), '..', 'data', 'pin_tier_map.json'
)
if os.path.exists(PIN_TIER_JSON_PATH):
    with open(PIN_TIER_JSON_PATH) as f:
        FULL_PIN_TIER_MAP = json.load(f)
    print(f"PIN tier map loaded: {len(FULL_PIN_TIER_MAP):,} PIN codes")
else:
    FULL_PIN_TIER_MAP = {}
    print("WARNING: pin_tier_map.json not found — using prefix fallback")

# Prefix fallback for unknown PINs
PIN_PREFIX_FALLBACK = {
    "11": 1, "40": 1, "56": 1, "60": 1, "50": 1, "70": 1,
    "22": 2, "30": 2, "38": 2, "41": 2, "45": 2, "44": 2,
}

def get_pin_tier(pin_code: str) -> int:
    pin = str(pin_code).strip().zfill(6)
    # Try exact match first
    if pin in FULL_PIN_TIER_MAP:
        return int(FULL_PIN_TIER_MAP[pin])
    # Try prefix fallback
    prefix = pin[:2]
    return PIN_PREFIX_FALLBACK.get(prefix, 2)


# ── Festive months (India calendar) ──────────────────────────────────────────
FESTIVE_MONTHS = {10, 11}

# ── Request / Response models ─────────────────────────────────────────────────
class ScoreRequest(BaseModel):
    order_id:       str
    raw_buyer_id:   str = Field(..., description="Phone/email — hashed before storage")
    merchant_id:    str
    order_value:    float = Field(..., gt=0)
    is_cod:         int   = Field(..., ge=0, le=1)
    pin_code:       str
    item_count:     int   = Field(default=1, ge=1)
    installments:   int   = Field(default=1, ge=1)
    order_month:    Optional[int] = None

class ScoreResponse(BaseModel):
    order_id:            str
    hashed_buyer_id:     str
    score:               float
    risk_level:          str
    factors:             List[str]
    recommended_action:  str
    fired_rules:         List[str]
    model_rto_prob:      float

class OutcomeRequest(BaseModel):
    order_id:       str
    merchant_id:    str
    raw_buyer_id:   str
    result:         str  # "delivered", "rto", "return"

# ── Helper: build feature vector ──────────────────────────────────────────────
def build_features(req: ScoreRequest, pin_tier: int,
                   prev_rto: int, is_first: int) -> pd.DataFrame:
    from datetime import datetime
    month = req.order_month or datetime.now().month
    is_festive  = int(month in FESTIVE_MONTHS)
    is_weekend  = 0  # Default — extension will pass this in future
    ov_bucket   = (1 if req.order_value < 500  else
                   2 if req.order_value < 1000 else
                   3 if req.order_value < 2000 else
                   4 if req.order_value < 5000 else 5)
    freight_ratio = min(0.3 + (pin_tier - 1) * 0.1, 0.6)  # Tier-based proxy
    low_review    = 0  # Will be updated after outcome is logged

   # Census socioeconomic features
    census_f = get_pin_features(req.pin_code)

    row = {
        "pin_tier":             pin_tier,
        "is_cod":               req.is_cod,
        "order_value":          req.order_value,
        "order_value_bucket":   ov_bucket,
        "freight_ratio":        freight_ratio,
        "item_count":           req.item_count,
        "is_weekend":           is_weekend,
        "is_festive_season":    is_festive,
        "is_first_order":       is_first,
        "prev_rto_count":       prev_rto,
        "low_review":           low_review,
        "installments":         req.installments,
        # Census features — real government data
        "internet_penetration": census_f["internet_penetration"],
        "mobile_penetration":   census_f["mobile_penetration"],
        "cod_risk_score":       census_f["cod_risk_score"],
        "electricity_access":   census_f["electricity_access"],
    }
    return pd.DataFrame([row])[FEATURES]

# ── Helper: build explanation factors ─────────────────────────────────────────
def build_factors(req: ScoreRequest, pin_tier: int,
                  prev_rto: int, rto_prob: float) -> List[str]:
    factors = []
    if pin_tier == 3:
        factors.append("High-RTO geographic zone (Tier 3)")
    elif pin_tier == 2:
        factors.append("Moderate-RTO zone (Tier 2)")
    if req.is_cod:
        factors.append("COD payment — 3x higher RTO risk")
    if prev_rto > 0:
        factors.append(f"Buyer has {prev_rto} previous RTO(s)")
    if req.order_value > 2000:
        factors.append(f"High order value (₹{req.order_value:,.0f})")
    from datetime import datetime
    if (req.order_month or datetime.now().month) in FESTIVE_MONTHS:
        factors.append("Festive season — elevated return rate")
    if not factors:
        factors.append("Low risk profile across all signals")
    return factors[:4]  # Cap at 4 for clean UI display

# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═════════════════════════════════════════════════════════════════════════════

@app.on_event("startup")
def startup():
    init_db()
    print("Trust Intelligence Platform API — ready")

@app.get("/health")
def health():
    return {
        "status":  "ok",
        "model":   "rto_model_v1",
        "features": len(FEATURES),
        "version": "0.1.0"
    }

@app.post("/v1/score", response_model=ScoreResponse)
def score_order(req: ScoreRequest):
    # 1. Hash buyer ID — raw PII never stored
    hashed = hash_buyer_id(req.raw_buyer_id, req.merchant_id)

    # 2. Look up buyer history from DB
    conn = get_connection()
    prev_outcomes = conn.execute(
        "SELECT result FROM outcomes WHERE hashed_buyer_id=? AND merchant_id=?",
        (hashed, req.merchant_id)
    ).fetchall()
    conn.close()

    prev_rto  = sum(1 for r in prev_outcomes if r["result"] == "rto")
    is_first  = int(len(prev_outcomes) == 0)
    pin_tier  = get_pin_tier(req.pin_code)

    # 3. Build features and run model
    X        = build_features(req, pin_tier, prev_rto, is_first)
    rto_prob = float(MODEL.predict_proba(X)[0][1])

    # 4. Convert RTO probability → Trust Score (0-100)
    # Higher RTO prob = lower trust score
    score = round((1 - rto_prob) * 100, 1)

    # 5. Risk level classification
    if score >= 70:
        risk_level = "LOW"
    elif score >= 40:
        risk_level = "MEDIUM"
    else:
        risk_level = "HIGH"

    # 6. Run rule engine
    order_dict   = {"order_value": req.order_value, "is_cod": req.is_cod}
    rule_result  = engine.evaluate(score, order_dict)

    # 7. Build explanation factors
    factors = build_factors(req, pin_tier, prev_rto, rto_prob)

    # 8. Store score in DB
    conn = get_connection()
    conn.execute("""
        INSERT INTO trust_scores
        (order_id, merchant_id, hashed_buyer_id, score, risk_level,
         factors, recommended_action, is_cod, order_value, pin_code)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    """, (
        req.order_id, req.merchant_id, hashed, score, risk_level,
        str(factors), rule_result["recommended_action"],
        req.is_cod, req.order_value, req.pin_code
    ))
    conn.execute("""
        INSERT OR IGNORE INTO orders
        (order_id, merchant_id, hashed_buyer_id,
         order_value, is_cod, pin_code)
        VALUES (?,?,?,?,?,?)
    """, (req.order_id, req.merchant_id, hashed,
          req.order_value, req.is_cod, req.pin_code))
    conn.commit()
    conn.close()

    return ScoreResponse(
        order_id           = req.order_id,
        hashed_buyer_id    = hashed,
        score              = score,
        risk_level         = risk_level,
        factors            = factors,
        recommended_action = rule_result["recommended_action"],
        fired_rules        = rule_result["fired_rules"],
        model_rto_prob     = round(rto_prob, 4)
    )

@app.post("/v1/outcome")
def log_outcome(req: OutcomeRequest):
    if req.result not in {"delivered", "rto", "return"}:
        raise HTTPException(400, "result must be: delivered, rto, or return")

    hashed = hash_buyer_id(req.raw_buyer_id, req.merchant_id)
    conn   = get_connection()
    conn.execute("""
        INSERT INTO outcomes
        (order_id, merchant_id, hashed_buyer_id, result)
        VALUES (?,?,?,?)
    """, (req.order_id, req.merchant_id, hashed, req.result))
    conn.commit()
    conn.close()
    return {"status": "logged", "order_id": req.order_id, "result": req.result}

@app.get("/v1/scores/{merchant_id}")
def get_scores(merchant_id: str, limit: int = 50):
    conn  = get_connection()
    rows  = conn.execute("""
        SELECT order_id, score, risk_level, recommended_action,
               is_cod, order_value, pin_code, created_at
        FROM   trust_scores
        WHERE  merchant_id = ?
        ORDER  BY created_at DESC
        LIMIT  ?
    """, (merchant_id, limit)).fetchall()
    conn.close()
    return {"merchant_id": merchant_id, "orders": [dict(r) for r in rows]}

@app.get("/v1/rules/{merchant_id}")
def get_rules(merchant_id: str):
    return {"merchant_id": merchant_id, "rules": engine.to_dict()}

@app.post("/v1/rules/{merchant_id}/threshold")
def update_cod_threshold(merchant_id: str, threshold: float):
    if not (0 <= threshold <= 100):
        raise HTTPException(400, "Threshold must be between 0 and 100")
    for rule in engine.rules:
        if rule.rule_name == "Block COD - High Risk":
            rule.condition_value = threshold
    return {"status": "updated", "new_threshold": threshold}
@app.post("/v1/rules/{merchant_id}/threshold")
def update_cod_threshold(merchant_id: str, threshold: float):
    if not (0 <= threshold <= 100):
        raise HTTPException(400, "Threshold must be between 0 and 100")
    for rule in engine.rules:
        if rule.rule_name == "Block COD - High Risk":
            rule.condition_value = threshold
    return {"status": "updated", "new_threshold": threshold}


# ── Shopify Webhook Receiver ──────────────────────────────────────────────────
@app.post("/v1/shopify/webhook")
async def shopify_webhook(request: Request, background_tasks: BackgroundTasks):
    body = await request.body()
    payload = {}
    try:
        payload = json.loads(body)
    except Exception:
        raise HTTPException(400, "Invalid JSON payload")
    background_tasks.add_task(process_shopify_order, payload)
    return {"status": "received"}


def process_shopify_order(order: dict):
    import sys
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from backend.shopify_integration import map_order_to_features, score_shopify_order
    try:
        features = map_order_to_features(order)
        result   = score_shopify_order(order)
        print(f"\n🛍️  New Shopify Order Received!")
        print(f"   Order   : {features.get('_shopify_order_number')}")
        print(f"   Customer: {features.get('_customer_name')}")
        print(f"   Value   : ₹{features.get('order_value')}")
        print(f"   Score   : {result.get('score')}")
        print(f"   Risk    : {result.get('risk_level')}")
        print(f"   Action  : {result.get('recommended_action')}")
    except Exception as e:
        print(f"Error processing Shopify order: {e}")


@app.get("/v1/shopify/orders")
def get_shopify_orders():
    from backend.shopify_integration import fetch_orders, score_shopify_order
    orders  = fetch_orders(limit=50)
    results = []
    for order in orders:
        result = score_shopify_order(order)
        if "error" not in result:
            results.append(result)
    return {"orders": results, "total": len(results)}
