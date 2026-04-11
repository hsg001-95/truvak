import sys
import os
import asyncio
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, HTTPException, Header, Depends, Query
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
import pickle
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import time
from functools import lru_cache

from backend.db import init_db, get_connection
from backend.db_adapter import adapt_query, close_connection, get_pool_telemetry, health_probe, is_postgres
from backend.privacy import hash_buyer_id
from backend.rule_engine import RuleEngine, Rule
from backend.reviews_router import router as reviews_router
from backend.customer_auth_router import router as customer_auth_router
from backend.customer_data_router import router as customer_data_router
from backend.price_router import router as price_router
from backend.seller_intel_router import router as seller_intel_router
from backend.watchlist_router import router as watchlist_router
from backend.selector_health_router import router as selector_health_router
from backend.customer_models import (
    init_customer_db,
    CustomerAccount,
    CustomerWatchlist,
    ProductPrice,
    ProductPriceSummary,
    SessionLocal,
    get_db,
)

import hashlib
import json
from fastapi import Request, BackgroundTasks
from sqlalchemy.orm import Session

if sys.platform.startswith("win"):
    # Avoid noisy Proactor socket shutdown errors on abrupt client disconnects.
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

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

EXTENSION_ORIGIN = os.getenv("EXTENSION_ORIGIN", "").strip()

allow_origins = [
    "http://127.0.0.1:8080",
    "http://localhost:8080",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:8501",
    "http://localhost:8501",
    "https://sellercentral.amazon.in",
    "https://sellercentral.amazon.com",
    "https://seller.flipkart.com",
]

if EXTENSION_ORIGIN.startswith("chrome-extension://"):
    allow_origins.append(EXTENSION_ORIGIN)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_origin_regex=r"(https?://(localhost|127\.0\.0\.1)(:\d+)?|chrome-extension://.*)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(reviews_router)
app.include_router(customer_auth_router)
app.include_router(customer_data_router)
app.include_router(price_router)
app.include_router(seller_intel_router)
app.include_router(watchlist_router)
app.include_router(selector_health_router)


def _error_payload(status_code: int, code: str, message: str, details=None):
    payload = {
        "error": {
            "status_code": int(status_code),
            "code": code,
            "message": message,
        }
    }
    if details is not None:
        payload["error"]["details"] = details
    return payload


@lru_cache(maxsize=16)
def _table_columns(table_name: str):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        if is_postgres():
            cursor.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = %s
                """,
                (table_name,),
            )
            rows = cursor.fetchall()
            return {
                row["column_name"] if isinstance(row, dict) else row[0]
                for row in rows
            }

        cursor.execute(f"PRAGMA table_info({table_name})")
        rows = cursor.fetchall()
        return {row[1] for row in rows}
    finally:
        cursor.close()
        close_connection(conn)


def _select_with_alias(columns, alias, candidates, fallback_sql):
    for candidate in candidates:
        if candidate in columns:
            return f"{candidate} AS {alias}"
    return f"{fallback_sql} AS {alias}"


def _trust_scores_select_parts():
    cols = _table_columns("trust_scores")

    score_sql = _select_with_alias(cols, "score", ("score", "trust_score"), "0")
    risk_sql = _select_with_alias(cols, "risk_level", ("risk_level",), "'UNKNOWN'")
    action_sql = _select_with_alias(cols, "recommended_action", ("recommended_action",), "'n/a'")
    is_cod_sql = _select_with_alias(cols, "is_cod", ("is_cod",), "0")
    order_value_sql = _select_with_alias(cols, "order_value", ("order_value",), "0")
    pin_sql = _select_with_alias(cols, "pin_code", ("pin_code",), "'------'")
    created_sql = _select_with_alias(cols, "created_at", ("created_at",), "CURRENT_TIMESTAMP")

    if "created_at" in cols:
        order_by_sql = "created_at DESC"
    elif "id" in cols:
        order_by_sql = "id DESC"
    else:
        order_by_sql = "order_id DESC"

    return {
        "score": score_sql,
        "risk": risk_sql,
        "action": action_sql,
        "is_cod": is_cod_sql,
        "order_value": order_value_sql,
        "pin": pin_sql,
        "created": created_sql,
        "order_by": order_by_sql,
    }


def _outcomes_parts():
    cols = _table_columns("outcomes")

    result_col = next(
        (c for c in ("result", "outcome", "status", "outcome_result") if c in cols),
        None,
    )
    logged_col = next(
        (c for c in ("logged_at", "created_at", "updated_at", "timestamp") if c in cols),
        None,
    )
    buyer_col = next(
        (c for c in ("hashed_buyer_id", "buyer_hash", "customer_id_hash") if c in cols),
        None,
    )

    if logged_col:
        order_by_sql = f"{logged_col} DESC"
    elif "id" in cols:
        order_by_sql = "id DESC"
    else:
        order_by_sql = "order_id DESC"

    return {
        "result_col": result_col,
        "logged_col": logged_col,
        "buyer_col": buyer_col,
        "order_by": order_by_sql,
    }


@app.exception_handler(HTTPException)
async def http_exception_handler(_, exc: HTTPException):
    detail = exc.detail

    if isinstance(detail, dict):
        message = detail.get("message") or detail.get("error") or "Request failed"
        code = detail.get("code") or f"HTTP_{exc.status_code}"
        details = detail.get("details")
    elif isinstance(detail, str):
        message = detail
        code = f"HTTP_{exc.status_code}"
        details = None
    else:
        message = "Request failed"
        code = f"HTTP_{exc.status_code}"
        details = detail

    return JSONResponse(
        status_code=exc.status_code,
        content=_error_payload(exc.status_code, code, message, jsonable_encoder(details)),
    )


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(_, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content=_error_payload(
            422,
            "VALIDATION_ERROR",
            "Request validation failed",
            jsonable_encoder(exc.errors()),
        ),
    )


@app.get("/healthz")
async def healthz():
    return {
        "status": "ok",
        "service": "trust-intelligence-platform",
        "version": "0.1.0",
        "timestamp_utc": datetime.utcnow().isoformat() + "Z",
    }

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


class LoginRequest(BaseModel):
    username: str
    password: str


class ProductPricePointRequest(BaseModel):
    product_id: str
    platform: str
    price: float = Field(..., gt=0)
    customer_id_hash: str


class PriceHistoryPoint(BaseModel):
    price: float
    observed_at: datetime
    source: str


class ProductPricePointResponse(BaseModel):
    product_id: str
    platform: str
    price_history: List[PriceHistoryPoint]


class ProductPriceSummaryResponse(BaseModel):
    product_id: str
    platform: str
    low: float
    high: float
    avg: float
    trend: str
    deal_indicator: str
    confidence_label: str
    data_points_count: int
    sparkline_data: List[float]
    summary_updated_at: datetime


class WatchlistCreateRequest(BaseModel):
    customer_id_hash: str
    product_id: str
    platform: str
    product_name: str
    product_url: str
    price_at_save: float = Field(..., gt=0)
    alert_threshold_pct: float = Field(default=5.0, ge=0)


class WatchlistPriceUpdateRequest(BaseModel):
    current_price: float = Field(..., gt=0)


class WatchlistCreateResponse(BaseModel):
    id: int


class WatchlistCheckPricesResponse(BaseModel):
    customer_id_hash: str
    watchlist_ids: List[int]
    product_urls: List[str]


class WatchlistDeleteResponse(BaseModel):
    id: int
    is_active: bool


class WatchlistItemResponse(BaseModel):
    id: int
    customer_id_hash: str
    product_id: str
    platform: str
    product_name: Optional[str] = None
    product_url: Optional[str] = None
    price_at_save: Optional[float] = None
    alert_threshold_pct: Optional[float] = None
    is_active: bool
    current_price: Optional[float] = None
    last_checked: Optional[datetime] = None
    alert_triggered: bool
    change_pct: Optional[float] = None


def _normalize_platform(platform: str) -> str:
    normalized = platform.strip().lower()
    if not normalized:
        raise HTTPException(status_code=400, detail="platform is required")
    return normalized


def _compute_trend(prices: List[float]) -> str:
    if len(prices) < 2:
        return "stable"
    first = prices[0]
    last = prices[-1]
    if first <= 0:
        return "stable"
    ratio = last / first
    if ratio > 1.02:
        return "rising"
    if ratio < 0.98:
        return "falling"
    return "stable"


def _compute_deal_indicator(current_price: float, avg_price: float) -> str:
    if current_price < 0.92 * avg_price:
        return "GOOD_DEAL"
    if current_price > 1.08 * avg_price:
        return "OVERPRICED"
    return "FAIR_PRICE"


def _compute_confidence_label(data_points_count: int) -> str:
    if data_points_count >= 30:
        return "high"
    if data_points_count >= 10:
        return "medium"
    return "low"


def _ensure_customer_exists(db: Session, customer_id_hash: str) -> None:
    customer = (
        db.query(CustomerAccount)
        .filter(CustomerAccount.customer_id_hash == customer_id_hash)
        .first()
    )
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")


def _get_latest_price(db: Session, product_id: str, platform: str) -> Optional[float]:
    latest = (
        db.query(ProductPrice)
        .filter(ProductPrice.product_id == product_id, ProductPrice.platform == platform)
        .order_by(ProductPrice.observed_at.desc())
        .first()
    )
    if not latest:
        return None
    return float(latest.price)


def _serialize_watchlist_item(item: CustomerWatchlist) -> WatchlistItemResponse:
    change_pct = None
    if item.current_price is not None and item.price_at_save and item.price_at_save > 0:
        change_pct = round(((float(item.current_price) - float(item.price_at_save)) / float(item.price_at_save)) * 100, 2)

    return WatchlistItemResponse(
        id=item.id,
        customer_id_hash=item.customer_id_hash,
        product_id=item.product_id,
        platform=item.platform,
        product_name=item.product_name,
        product_url=item.product_url,
        price_at_save=float(item.price_at_save) if item.price_at_save is not None else None,
        alert_threshold_pct=float(item.alert_threshold_pct) if item.alert_threshold_pct is not None else None,
        is_active=bool(item.is_active),
        current_price=float(item.current_price) if item.current_price is not None else None,
        last_checked=item.last_checked,
        alert_triggered=bool(item.alert_sent),
        change_pct=change_pct,
    )


def recompute_price_summary_for_product(product_id: str, platform: str) -> Optional[ProductPriceSummary]:
    db = SessionLocal()
    try:
        cutoff = datetime.utcnow() - timedelta(days=15)
        rows = (
            db.query(ProductPrice)
            .filter(
                ProductPrice.product_id == product_id,
                ProductPrice.platform == platform,
                ProductPrice.observed_at >= cutoff,
            )
            .order_by(ProductPrice.observed_at.asc())
            .all()
        )
        if not rows:
            return None

        prices = [float(row.price) for row in rows]
        low = min(prices)
        high = max(prices)
        avg = sum(prices) / len(prices)
        current_price = prices[-1]
        trend = _compute_trend(prices)
        confidence_label = _compute_confidence_label(len(prices))
        deal_indicator = _compute_deal_indicator(current_price, avg)

        summary = (
            db.query(ProductPriceSummary)
            .filter(
                ProductPriceSummary.product_id == product_id,
                ProductPriceSummary.platform == platform,
            )
            .first()
        )
        if not summary:
            summary = ProductPriceSummary(product_id=product_id, platform=platform)
            db.add(summary)

        summary.price_15d_low = low
        summary.price_15d_high = high
        summary.price_15d_avg = avg
        summary.current_price = current_price
        summary.data_points_count = len(prices)
        summary.trend_direction = trend
        summary.deal_indicator = deal_indicator == "GOOD_DEAL"
        summary.confidence_label = confidence_label
        summary.last_updated = datetime.utcnow()

        db.commit()
        db.refresh(summary)
        return summary
    finally:
        db.close()

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
    init_customer_db()
    print("Trust Intelligence Platform API — ready")

@app.get("/health")
def health():
    probe = health_probe()
    pool = get_pool_telemetry()
    return {
        "status": "ok" if probe.get("connected") else "degraded",
        "model": "rto_model_v1",
        "features": len(FEATURES),
        "db_status": "connected" if probe.get("connected") else f"error: {probe.get('error', 'unknown')}",
        "db_type": "postgresql" if is_postgres() else "sqlite",
        "db_latency_ms": probe.get("latency_ms"),
        "db_pool": pool,
        "version": "2.0",
    }

@app.post("/v1/score", response_model=ScoreResponse)
def score_order(req: ScoreRequest):
    # 1. Hash buyer ID — raw PII never stored
    hashed = hash_buyer_id(req.raw_buyer_id, req.merchant_id)

    # 2. Look up buyer history from DB
    conn = get_connection()
    cursor = conn.cursor()
    outcomes_parts = _outcomes_parts()
    result_col = outcomes_parts["result_col"]
    buyer_col = outcomes_parts["buyer_col"]

    try:
        if result_col and buyer_col:
            cursor.execute(
                adapt_query(
                    f"SELECT {result_col} AS result FROM outcomes WHERE {buyer_col}=? AND merchant_id=?"
                ),
                (hashed, req.merchant_id),
            )
            prev_outcomes = cursor.fetchall()
        else:
            prev_outcomes = []
    except Exception:
        # If outcomes schema is drifted, do not fail scoring; treat as no previous outcomes.
        prev_outcomes = []
    cursor.close()
    close_connection(conn)

    prev_rto  = sum(1 for r in prev_outcomes if r["result"] == "rto")
    is_first  = int(len(prev_outcomes) == 0)
    pin_tier  = get_pin_tier(req.pin_code)

    # 3. Build features and run model
    X        = build_features(req, pin_tier, prev_rto, is_first)
    rto_prob = float(MODEL.predict_proba(X)[0][1])

    # 4. Convert RTO probability → Trust Score (0-100)
    # Apply mild calibration to reduce cold-start over-penalization.
    raw_score = (1 - rto_prob) * 100
    calibrated_score = (raw_score * 0.9) + 8
    score = round(float(np.clip(calibrated_score, 0, 100)), 1)

    # 5. Risk level classification
    if score >= 65:
        risk_level = "LOW"
    elif score >= 42:
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
    cursor = conn.cursor()
    trust_cols = _table_columns("trust_scores")
    trust_insert = {
        "order_id": req.order_id,
        "merchant_id": req.merchant_id,
        "hashed_buyer_id": hashed,
        "risk_level": risk_level,
        "factors": json.dumps(factors),
        "recommended_action": rule_result["recommended_action"],
        "is_cod": req.is_cod,
        "order_value": req.order_value,
        "pin_code": req.pin_code,
        "score": score,
        "trust_score": score,
        "rto_probability": rto_prob,
    }
    insert_cols = [c for c in trust_insert.keys() if c in trust_cols]
    insert_vals = [trust_insert[c] for c in insert_cols]

    if not insert_cols:
        raise HTTPException(500, "trust_scores schema has no compatible columns")

    placeholders = ",".join(["?"] * len(insert_cols))
    cursor.execute(
        adapt_query(
            f"INSERT INTO trust_scores ({', '.join(insert_cols)}) VALUES ({placeholders})"
        ),
        tuple(insert_vals),
    )

    if is_postgres():
        cursor.execute(
            adapt_query(
                """
                INSERT INTO orders
                (order_id, merchant_id, hashed_buyer_id,
                 order_value, is_cod, pin_code)
                VALUES (?,?,?,?,?,?)
                ON CONFLICT (order_id) DO NOTHING
                """
            ),
            (req.order_id, req.merchant_id, hashed, req.order_value, bool(req.is_cod), req.pin_code),
        )
    else:
        cursor.execute(
            adapt_query(
                """
                INSERT OR IGNORE INTO orders
                (order_id, merchant_id, hashed_buyer_id,
                 order_value, is_cod, pin_code)
                VALUES (?,?,?,?,?,?)
                """
            ),
            (req.order_id, req.merchant_id, hashed, req.order_value, bool(req.is_cod), req.pin_code),
        )

    conn.commit()
    cursor.close()
    close_connection(conn)

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
    outcomes_parts = _outcomes_parts()
    result_col = outcomes_parts["result_col"]
    buyer_col = outcomes_parts["buyer_col"]
    if not result_col:
        raise HTTPException(500, "Outcomes schema missing result column")

    conn   = get_connection()
    cursor = conn.cursor()
    try:
        if buyer_col:
            cursor.execute(
                adapt_query(
                    f"""
                    INSERT INTO outcomes
                    (order_id, merchant_id, {buyer_col}, {result_col})
                    VALUES (?,?,?,?)
                    """
                ),
                (req.order_id, req.merchant_id, hashed, req.result),
            )
        else:
            cursor.execute(
                adapt_query(
                    f"""
                    INSERT INTO outcomes
                    (order_id, merchant_id, {result_col})
                    VALUES (?,?,?)
                    """
                ),
                (req.order_id, req.merchant_id, req.result),
            )
    except Exception:
        # Retry with minimal shared columns if schema differs from introspection.
        cursor.execute(
            adapt_query(
                f"""
                INSERT INTO outcomes
                (order_id, merchant_id, {result_col})
                VALUES (?,?,?)
                """
            ),
            (req.order_id, req.merchant_id, req.result),
        )
    conn.commit()
    cursor.close()
    close_connection(conn)
    return {"status": "logged", "order_id": req.order_id, "result": req.result}

@app.get("/v1/scores/{merchant_id}")
def get_scores(merchant_id: str, limit: int = 50):
    trust_cols = _table_columns("trust_scores")
    order_cols = _table_columns("orders")

    score_expr = "ts.score" if "score" in trust_cols else ("ts.trust_score" if "trust_score" in trust_cols else "0")
    risk_expr = "ts.risk_level" if "risk_level" in trust_cols else "'UNKNOWN'"
    action_expr = "ts.recommended_action" if "recommended_action" in trust_cols else "'n/a'"

    value_candidates = []
    if "order_value" in trust_cols:
        value_candidates.append("ts.order_value")
    if "order_value" in order_cols:
        value_candidates.append("o.order_value")
    order_value_expr = f"COALESCE({', '.join(value_candidates)}, 0)" if value_candidates else "0"

    cod_candidates = []
    if "is_cod" in trust_cols:
        cod_candidates.append("CAST(ts.is_cod AS INTEGER)")
    if "is_cod" in order_cols:
        cod_candidates.append("CAST(o.is_cod AS INTEGER)")
    is_cod_expr = f"COALESCE({', '.join(cod_candidates)}, 0)" if cod_candidates else "0"

    pin_candidates = []
    if "pin_code" in trust_cols:
        pin_candidates.append("ts.pin_code")
    if "pin_code" in order_cols:
        pin_candidates.append("o.pin_code")
    pin_expr = f"COALESCE({', '.join(pin_candidates)}, '------')" if pin_candidates else "'------'"

    if "created_at" in trust_cols:
        order_by_sql = "ts.created_at DESC"
    elif "id" in trust_cols:
        order_by_sql = "ts.id DESC"
    else:
        order_by_sql = "ts.order_id DESC"

    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            adapt_query(
                f"""
                SELECT ts.order_id,
                       {score_expr} AS score,
                       {risk_expr} AS risk_level,
                       {action_expr} AS recommended_action,
                       {is_cod_expr} AS is_cod,
                       {order_value_expr} AS order_value,
                       {pin_expr} AS pin_code,
                       COALESCE(ts.created_at, o.created_at, CURRENT_TIMESTAMP) AS created_at
                FROM trust_scores ts
                LEFT JOIN orders o
                       ON o.order_id = ts.order_id
                      AND o.merchant_id = ts.merchant_id
                WHERE ts.merchant_id = ?
                ORDER BY {order_by_sql}
                LIMIT ?
                """
            ),
            (merchant_id, limit),
        )
        rows = cursor.fetchall()
    finally:
        if cursor is not None:
            cursor.close()
        close_connection(conn)

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


@app.post("/v1/login")
def login(req: LoginRequest):
    # Demo-only auth endpoint retained for legacy popup/react callers.
    demo_users = {
        "merchant_amazon": "Trust@2024",
        "merchant_flipkart": "Trust@2024",
        "merchant_shopify": "Trust@2024",
    }
    if demo_users.get(req.username) != req.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {
        "message": "Login successful",
        "token": req.username,
        "merchant_id": req.username,
    }


@app.get("/v1/orders")
def get_orders(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Invalid token")

    merchant_id = token
    parts = _trust_scores_select_parts()

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        adapt_query(
            f"""
            SELECT order_id,
                   {parts['score']},
                   {parts['risk']}
            FROM trust_scores
            WHERE merchant_id = ?
            ORDER BY {parts['order_by']}
            LIMIT 100
            """
        ),
        (merchant_id,),
    )
    rows = cursor.fetchall()
    cursor.close()
    close_connection(conn)

    status_map = {
        "HIGH": "Pending",
        "MEDIUM": "Shipped",
        "LOW": "Delivered",
    }
    orders = [
        {
            "id": row["order_id"],
            "status": status_map.get(row["risk_level"], "Pending"),
            "risk_level": row["risk_level"],
            "score": row["score"],
        }
        for row in rows
    ]
    return {"orders": orders}


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
@app.get("/v1/outcomes/{merchant_id}")
def get_outcomes(merchant_id: str):
    outcomes_parts = _outcomes_parts()
    result_col = outcomes_parts["result_col"]
    logged_col = outcomes_parts["logged_col"]
    buyer_col = outcomes_parts["buyer_col"]
    if not result_col:
        return {"outcomes": []}

    logged_sql = f"{logged_col} AS logged_at" if logged_col else "CURRENT_TIMESTAMP AS logged_at"
    buyer_sql = f"{buyer_col} AS hashed_buyer_id" if buyer_col else "NULL AS hashed_buyer_id"

    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            adapt_query(
                f"""
                SELECT order_id, merchant_id, {buyer_sql},
                       {result_col} AS result,
                       {logged_sql}
                FROM outcomes
                WHERE merchant_id=?
                ORDER BY {outcomes_parts['order_by']}
                LIMIT 200
                """
            ),
            (merchant_id,),
        )
        rows = cursor.fetchall()
    except Exception:
        rows = []
    cursor.close()
    close_connection(conn)
    return {"outcomes": [dict(r) for r in rows]}
@app.get("/v1/buyer/history/{hashed_buyer_id}/{merchant_id}")
def get_buyer_history(hashed_buyer_id: str, merchant_id: str):
    outcomes_parts = _outcomes_parts()
    result_col = outcomes_parts["result_col"]
    logged_col = outcomes_parts["logged_col"]
    buyer_col = outcomes_parts["buyer_col"]

    trust_cols = _table_columns("trust_scores")
    order_cols = _table_columns("orders")

    score_expr = "ts.score" if "score" in trust_cols else ("ts.trust_score" if "trust_score" in trust_cols else "0")
    risk_expr = "ts.risk_level" if "risk_level" in trust_cols else "'UNKNOWN'"
    action_expr = "ts.recommended_action" if "recommended_action" in trust_cols else "'n/a'"

    value_candidates = []
    if "order_value" in trust_cols:
        value_candidates.append("ts.order_value")
    if "order_value" in order_cols:
        value_candidates.append("o.order_value")
    order_value_expr = f"COALESCE({', '.join(value_candidates)}, 0)" if value_candidates else "0"

    cod_candidates = []
    if "is_cod" in trust_cols:
        cod_candidates.append("CAST(ts.is_cod AS INTEGER)")
    if "is_cod" in order_cols:
        cod_candidates.append("CAST(o.is_cod AS INTEGER)")
    is_cod_expr = f"COALESCE({', '.join(cod_candidates)}, 0)" if cod_candidates else "0"

    created_expr = "COALESCE(ts.created_at, o.created_at, CURRENT_TIMESTAMP)"

    conn = get_connection()
    cursor = conn.cursor()

    # All orders for this buyer under this merchant
    cursor.execute(adapt_query("""
        SELECT ts.order_id,
               {score_expr} AS score,
               {risk_expr} AS risk_level,
               {action_expr} AS recommended_action,
               {order_value_expr} AS order_value,
               {is_cod_expr} AS is_cod,
               {created_expr} AS created_at
        FROM trust_scores ts
        LEFT JOIN orders o
               ON o.order_id = ts.order_id
              AND o.merchant_id = ts.merchant_id
        WHERE ts.hashed_buyer_id=? AND ts.merchant_id=?
        ORDER BY ts.created_at DESC
    """.format(
        score_expr=score_expr,
        risk_expr=risk_expr,
        action_expr=action_expr,
        order_value_expr=order_value_expr,
        is_cod_expr=is_cod_expr,
        created_expr=created_expr,
    )), (hashed_buyer_id, merchant_id))
    orders = cursor.fetchall()

    # Outcomes logged for this buyer
    if result_col and buyer_col:
        logged_sql = f"{logged_col} AS logged_at" if logged_col else "CURRENT_TIMESTAMP AS logged_at"
        try:
            cursor.execute(
                adapt_query(
                    f"""
                    SELECT {result_col} AS result, {logged_sql}
                    FROM outcomes
                    WHERE {buyer_col}=? AND merchant_id=?
                    ORDER BY {outcomes_parts['order_by']}
                    """
                ),
                (hashed_buyer_id, merchant_id),
            )
            outcomes = cursor.fetchall()
        except Exception:
            outcomes = []
    else:
        outcomes = []

    cursor.close()
    close_connection(conn)

    # Deduplicate by order_id because rescoring the same order may write multiple rows.
    unique_orders = []
    seen_order_ids = set()
    for row in orders:
        order_id = row.get("order_id") if isinstance(row, dict) else row["order_id"]
        if order_id in seen_order_ids:
            continue
        seen_order_ids.add(order_id)
        unique_orders.append(row)

    unique_outcomes = []
    seen_outcome_order_ids = set()
    for row in outcomes:
        order_id = row.get("order_id") if isinstance(row, dict) else row["order_id"] if "order_id" in row else None
        if order_id is None:
            unique_outcomes.append(row)
            continue
        if order_id in seen_outcome_order_ids:
            continue
        seen_outcome_order_ids.add(order_id)
        unique_outcomes.append(row)

    total_orders  = len(unique_orders)
    rto_count     = sum(1 for o in unique_outcomes if o["result"] == "rto")
    return_count  = sum(1 for o in unique_outcomes if o["result"] == "return")
    delivered     = sum(1 for o in unique_outcomes if o["result"] == "delivered")
    avg_score     = round(
        sum(float(o["score"]) for o in unique_orders) / total_orders, 1
    ) if total_orders else 0
    high_risk     = sum(1 for o in unique_orders if o["risk_level"] == "HIGH")
    blocked       = sum(
        1 for o in unique_orders if o["recommended_action"] == "block_cod"
    )

    # Risk profile
    if rto_count >= 2:
        profile = "⚠️ Serial RTO Buyer"
    elif rto_count == 1:
        profile = "⚡ Previous RTO — Caution"
    elif total_orders >= 3 and avg_score >= 70:
        profile = "✅ Trusted Repeat Buyer"
    elif total_orders == 0:
        profile = "🆕 First Time Buyer"
    else:
        profile = "📦 Regular Buyer"

    return {
        "hashed_buyer_id": hashed_buyer_id,
        "total_orders":    total_orders,
        "rto_count":       rto_count,
        "return_count":    return_count,
        "delivered_count": delivered,
        "avg_score":       avg_score,
        "high_risk_count": high_risk,
        "blocked_count":   blocked,
        "risk_profile":    profile,
        "recent_orders":   [dict(o) for o in unique_orders[:5]],
    }


@app.get("/v1/area/intelligence/{pin_code}")
def get_area_intelligence(pin_code: str):
    import json as json_lib

    # Load Census PIN feature map
    pin_feature_path = os.path.join(
        os.path.dirname(__file__), '..', 'data', 'pin_feature_map.json'
    )
    pin_tier_path = os.path.join(
        os.path.dirname(__file__), '..', 'data', 'pin_tier_map.json'
    )

    features = {}
    tier     = 2  # default

    if os.path.exists(pin_feature_path):
        with open(pin_feature_path) as f:
            pin_map = json_lib.load(f)
        features = pin_map.get(str(pin_code).zfill(6), {})

    if os.path.exists(pin_tier_path):
        with open(pin_tier_path) as f:
            tier_map = json_lib.load(f)
        tier = tier_map.get(str(pin_code).zfill(6), 2)

    # Derive area stats from Census features
    internet  = features.get("internet_penetration", 0.008)
    mobile    = features.get("mobile_penetration",   0.386)
    cod_risk  = features.get("cod_risk_score",       0.79)
    urban     = features.get("urban_ratio",          0.21)
    electric  = features.get("electricity_access",   0.51)

    # Area RTO rate estimate based on tier
    area_rto_rate = {1: 0.12, 2: 0.24, 3: 0.38}.get(tier, 0.24)

    # COD preference estimate
    cod_preference = {1: 0.35, 2: 0.55, 3: 0.70}.get(tier, 0.55)

    # Tier label
    tier_label = {
        1: "Tier 1 — Metro",
        2: "Tier 2 — Mid City",
        3: "Tier 3 — Rural/Remote"
    }.get(tier, "Tier 2")

    # Risk label
    if tier == 1:
        area_risk = "Low Risk Zone"
    elif tier == 2:
        area_risk = "Medium Risk Zone"
    else:
        area_risk = "High Risk Zone"

    return {
        "pin_code":          pin_code,
        "tier":              tier,
        "tier_label":        tier_label,
        "area_risk":         area_risk,
        "area_rto_rate":     round(area_rto_rate * 100, 1),
        "cod_preference":    round(cod_preference * 100, 1),
        "internet_pct":      round(internet * 100, 1),
        "mobile_pct":        round(mobile * 100, 1),
        "urban_pct":         round(urban * 100, 1),
        "electricity_pct":   round(electric * 100, 1),
        "cod_risk_score":    round(cod_risk, 3),
    }

