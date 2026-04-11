from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.customer_auth_router import get_current_customer
from backend.customer_models import ProductPriceSummary, get_db
from backend.db import get_connection
from backend.db_adapter import adapt_query, close_connection

CATEGORY_RISK_LEVELS = {
    "electronics": "HIGH",
    "mobile": "HIGH",
    "computers": "HIGH",
    "toys": "HIGH",
    "baby": "HIGH",
    "fashion": "MEDIUM",
    "clothing": "MEDIUM",
    "sports": "MEDIUM",
    "home": "LOW",
    "kitchen": "LOW",
    "books": "LOW",
    "grocery": "LOW",
    "beauty": "LOW",
    "default": "MEDIUM",
}


class SellerTrustResponse(BaseModel):
    seller_id: str
    seller_trust_score: int
    trust_level: str
    rto_rate: float
    return_rate: float
    cod_fulfillment_rate: float
    order_count: int
    avg_trust_score: float
    data_confidence: str
    verdict_reason: str


class CounterfeitRiskResponse(BaseModel):
    product_id: str
    risk_level: str
    risk_score: float
    reasons: List[str]
    category_risk: str
    price_deviation_flag: bool
    confidence: str


router = APIRouter()


def _data_confidence_from_count(count: int) -> str:
    if count > 50:
        return "HIGH"
    if count >= 10:
        return "MEDIUM"
    return "LOW"


@router.get("/v1/seller/trust/{seller_id}", response_model=SellerTrustResponse)
async def get_seller_trust(
    seller_id: str,
    _customer_id_hash: str = Depends(get_current_customer),
):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            adapt_query("SELECT order_id, score, is_cod FROM trust_scores WHERE merchant_id = ?"),
            (seller_id,),
        )
        trust_rows = cursor.fetchall()

        if not trust_rows:
            return SellerTrustResponse(
                seller_id=seller_id,
                seller_trust_score=50,
                trust_level="DEFAULT",
                rto_rate=0.0,
                return_rate=0.0,
                cod_fulfillment_rate=0.0,
                order_count=0,
                avg_trust_score=50.0,
                data_confidence="LOW",
                verdict_reason="Default score",
            )

        avg_trust_score = sum(float(row["score"]) for row in trust_rows) / len(trust_rows)
        data_confidence = _data_confidence_from_count(len(trust_rows))

        cursor.execute(
            adapt_query("SELECT order_id, result FROM outcomes WHERE merchant_id = ?"),
            (seller_id,),
        )
        outcome_rows = cursor.fetchall()

        total_outcomes = len(outcome_rows)
        rto_rate = (
            sum(1 for row in outcome_rows if row["result"] == "rto") / total_outcomes
            if total_outcomes > 0
            else 0.0
        )
        return_rate = (
            sum(1 for row in outcome_rows if row["result"] == "return") / total_outcomes
            if total_outcomes > 0
            else 0.0
        )

        outcome_by_order = {row["order_id"]: row["result"] for row in outcome_rows}
        cod_order_ids = [row["order_id"] for row in trust_rows if int(row["is_cod"]) == 1]
        total_cod_orders = len(cod_order_ids)
        cod_delivered = sum(
            1 for order_id in cod_order_ids if outcome_by_order.get(order_id) == "delivered"
        )
        cod_fulfillment_rate = (cod_delivered / total_cod_orders) if total_cod_orders > 0 else 0.0

        seller_trust = (
            (avg_trust_score * 0.40)
            + ((1 - rto_rate) * 100 * 0.30)
            + (cod_fulfillment_rate * 100 * 0.20)
        )

        if data_confidence == "HIGH":
            seller_trust += 8
        elif data_confidence == "MEDIUM":
            seller_trust += 6

        seller_trust = max(0, min(100, int(round(seller_trust))))

        if seller_trust >= 70:
            trust_level = "VERIFIED"
        elif seller_trust < 45:
            trust_level = "FLAGGED"
        else:
            trust_level = "UNVERIFIED"

        verdict_reason = f"{trust_level} based on {data_confidence} data and {seller_trust} score"

        return SellerTrustResponse(
            seller_id=seller_id,
            seller_trust_score=seller_trust,
            trust_level=trust_level,
            rto_rate=round(rto_rate, 4),
            return_rate=round(return_rate, 4),
            cod_fulfillment_rate=round(cod_fulfillment_rate, 4),
            order_count=total_outcomes,
            avg_trust_score=round(avg_trust_score, 2),
            data_confidence=data_confidence,
            verdict_reason=verdict_reason,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error retrieving seller trust: {exc}")
    finally:
        cursor.close()
        close_connection(conn)


@router.get("/v1/seller-intel/trust/{seller_id}", response_model=SellerTrustResponse)
async def get_seller_trust_alias(
    seller_id: str,
    _customer_id_hash: str = Depends(get_current_customer),
):
    # Backward-compatible alias for older clients.
    return await get_seller_trust(seller_id=seller_id, _customer_id_hash=_customer_id_hash)


@router.get("/v1/product/counterfeit-risk/{product_id}", response_model=CounterfeitRiskResponse)
async def get_product_counterfeit_risk(
    product_id: str,
    category: str = Query(...),
    current_price: float = Query(..., gt=0),
    brand: Optional[str] = None,
    _customer_id_hash: str = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    normalized_category = category.strip().lower()
    category_risk = CATEGORY_RISK_LEVELS.get(normalized_category, CATEGORY_RISK_LEVELS["default"])

    base_risk_score = 0.2 if category_risk == "LOW" else (0.4 if category_risk == "MEDIUM" else 0.6)

    summary = (
        db.query(ProductPriceSummary)
        .filter(ProductPriceSummary.product_id == product_id)
        .order_by(ProductPriceSummary.last_updated.desc())
        .first()
    )

    price_deviation_flag = False
    data_points_count = 0

    if summary and summary.price_15d_avg and float(summary.price_15d_avg) > 0:
        avg_price_15d = float(summary.price_15d_avg)
        price_deviation = abs(float(current_price) - avg_price_15d) / avg_price_15d
        price_deviation_flag = price_deviation > 0.6
        data_points_count = int(summary.data_points_count or 0)

        if price_deviation_flag:
            base_risk_score += 0.3

    if not brand:
        base_risk_score += 0.1

    risk_score = round(min(base_risk_score, 1.0), 4)
    if risk_score >= 0.65:
        risk_level = "HIGH"
    elif risk_score >= 0.35:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    reasons: List[str] = []
    if category_risk == "HIGH":
        reasons.append(f"High-risk category: {normalized_category}")
    if price_deviation_flag:
        reasons.append("Price deviation from average by more than 60%")
    if not brand:
        reasons.append("Brand information missing")
    if not reasons:
        reasons.append("No strong counterfeit signals detected")

    confidence = _data_confidence_from_count(data_points_count)

    return CounterfeitRiskResponse(
        product_id=product_id,
        risk_level=risk_level,
        risk_score=risk_score,
        reasons=reasons,
        category_risk=category_risk,
        price_deviation_flag=price_deviation_flag,
        confidence=confidence,
    )
