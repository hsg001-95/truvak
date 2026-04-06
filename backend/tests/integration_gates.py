import json
import urllib.error
import urllib.request
from typing import Any, Dict, Optional, Tuple

BASE_URL = "http://127.0.0.1:8000"


def call(
    method: str,
    path: str,
    body: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
) -> Tuple[int, Any]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)

    req = urllib.request.Request(BASE_URL + path, data=data, headers=req_headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            text = resp.read().decode("utf-8")
            try:
                return resp.getcode(), json.loads(text)
            except json.JSONDecodeError:
                return resp.getcode(), text
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(text)
        except json.JSONDecodeError:
            return exc.code, text


def expect_status(name: str, got: int, expected: int) -> None:
    if got != expected:
        raise AssertionError(f"{name}: expected {expected}, got {got}")


def main() -> None:
    # P0
    health_code, _ = call("GET", "/healthz")
    expect_status("healthz", health_code, 200)

    _, _ = call(
        "POST",
        "/v1/customer/auth/register",
        {
            "email": "gates_user_a@example.com",
            "password": "StrongPass123",
            "pin_code": "560001",
        },
    )

    login_code, login_body = call(
        "POST",
        "/v1/customer/auth/login",
        {"email": "gates_user_a@example.com", "password": "StrongPass123"},
    )
    expect_status("login_user_a", login_code, 200)
    token_a = login_body.get("token", "")
    customer_a = login_body.get("customer_id_hash", "")
    headers_a = {"Authorization": f"Bearer {token_a}"}

    me_unauth_code, _ = call("GET", "/v1/customer/auth/me")
    expect_status("me_without_token", me_unauth_code, 401)

    me_auth_code, _ = call("GET", "/v1/customer/auth/me", headers=headers_a)
    expect_status("me_with_token", me_auth_code, 200)

    # P1/P2/P4/P5 watchlist lifecycle + error paths
    add_code, add_body = call(
        "POST",
        "/v1/customer/watchlist",
        {
            "product_id": "GATES-WL-001",
            "platform": "amazon",
            "product_name": "Gates Product",
            "product_url": "https://www.amazon.in/dp/GATESWL001",
            "price_at_save": 1200,
            "alert_threshold_pct": 10,
        },
        headers=headers_a,
    )
    watchlist_id = None
    if add_code == 200:
        watchlist_id = add_body["id"]
    elif add_code == 409:
        list_existing_code, list_existing_body = call("GET", "/v1/customer/watchlist", headers=headers_a)
        expect_status("watchlist_list_existing", list_existing_code, 200)
        for item in list_existing_body:
            if item.get("product_id") == "GATES-WL-001" and item.get("platform") == "amazon":
                watchlist_id = item.get("id")
                break
    else:
        raise AssertionError(f"watchlist_add: expected 200 or 409, got {add_code}")

    if not watchlist_id:
        raise AssertionError("watchlist_add: could not resolve watchlist item id")

    dup_code, _ = call(
        "POST",
        "/v1/customer/watchlist",
        {
            "product_id": "GATES-WL-001",
            "platform": "amazon",
            "product_name": "Gates Product",
            "product_url": "https://www.amazon.in/dp/GATESWL001",
            "price_at_save": 1200,
            "alert_threshold_pct": 10,
        },
        headers=headers_a,
    )
    expect_status("watchlist_duplicate", dup_code, 409)

    list_code, _ = call("GET", "/v1/customer/watchlist", headers=headers_a)
    expect_status("watchlist_list", list_code, 200)

    invalid_code, invalid_body = call(
        "POST",
        "/v1/customer/watchlist",
        {
            "product_id": "GATES-WL-INVALID",
            "platform": "invalid_platform",
            "product_name": "Bad Platform",
            "product_url": "https://example.com/bad",
            "price_at_save": 100,
            "alert_threshold_pct": 5,
        },
        headers=headers_a,
    )
    expect_status("watchlist_validation", invalid_code, 422)
    if not isinstance(invalid_body, dict) or "error" not in invalid_body:
        raise AssertionError("validation error envelope missing")

    patch_code, _ = call(
        "PATCH",
        f"/v1/customer/watchlist/{watchlist_id}",
        {"current_price": 900},
        headers=headers_a,
    )
    expect_status("watchlist_patch", patch_code, 200)

    check_code, _ = call("POST", "/v1/customer/watchlist/check-prices", headers=headers_a)
    expect_status("watchlist_check_prices", check_code, 200)

    alert_code, _ = call(
        "POST",
        f"/v1/customer/watchlist/{watchlist_id}/alert-sent",
        headers=headers_a,
    )
    expect_status("watchlist_alert_sent", alert_code, 200)

    not_found_code, _ = call(
        "PATCH",
        "/v1/customer/watchlist/999999",
        {"current_price": 100},
        headers=headers_a,
    )
    expect_status("watchlist_not_found", not_found_code, 404)

    # P3 ownership
    _, _ = call(
        "POST",
        "/v1/customer/auth/register",
        {
            "email": "gates_user_b@example.com",
            "password": "StrongPass123",
            "pin_code": "560001",
        },
    )
    login_b_code, login_b_body = call(
        "POST",
        "/v1/customer/auth/login",
        {"email": "gates_user_b@example.com", "password": "StrongPass123"},
    )
    expect_status("login_user_b", login_b_code, 200)
    headers_b = {"Authorization": f"Bearer {login_b_body.get('token', '')}"}

    sync_code, _ = call(
        "POST",
        "/v1/customer/orders/sync",
        {
            "orders": [
                {
                    "order_id_raw": "GATES-ORDER-A-001",
                    "platform": "amazon",
                    "product_category": "electronics",
                    "order_value": 2500,
                    "order_date": "2026-04-01",
                    "order_status": "delivered",
                    "is_cod": False,
                    "order_hour": 12,
                }
            ]
        },
        headers=headers_a,
    )
    expect_status("orders_sync", sync_code, 200)

    spend_owner_code, _ = call("GET", f"/v1/customer/spend/{customer_a}?days=30", headers=headers_a)
    expect_status("spend_owner", spend_owner_code, 200)

    profile_owner_code, _ = call("GET", f"/v1/customer/profile/{customer_a}", headers=headers_a)
    expect_status("profile_owner", profile_owner_code, 200)

    spend_cross_code, _ = call("GET", f"/v1/customer/spend/{customer_a}?days=30", headers=headers_b)
    expect_status("spend_cross_customer", spend_cross_code, 403)

    profile_cross_code, _ = call("GET", f"/v1/customer/profile/{customer_a}", headers=headers_b)
    expect_status("profile_cross_customer", profile_cross_code, 403)

    delete_code, _ = call("DELETE", f"/v1/customer/watchlist/{watchlist_id}", headers=headers_a)
    expect_status("watchlist_delete", delete_code, 200)

    print("PASS: backend gates P0-P5")


if __name__ == "__main__":
    main()
