from datetime import datetime, timedelta
from typing import Dict, List, Optional
import hashlib

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.customer_auth_router import get_current_customer
from backend.customer_models import CustomerOrder, get_db

router = APIRouter()


class OrderSyncItem(BaseModel):
    order_id_raw: str
    platform: str
    product_category: str
    order_value: float = Field(..., gt=0)
    order_date: str
    order_status: str
    is_cod: bool = False
    order_hour: int = Field(..., ge=0, le=23)


class OrderSyncRequest(BaseModel):
    orders: List[OrderSyncItem] = []


class OrderSyncResponse(BaseModel):
    synced_count: int
    duplicate_count: int
    total_stored: int
    last_sync_at: str


class CategoryBreakdown(BaseModel):
    category: str
    total_spend: float
    order_count: int
    return_count: int
    percentage: float


class DailySpend(BaseModel):
    date: str
    amazon_spend: float
    flipkart_spend: float
    total_spend: float


class SpendAnalysisResponse(BaseModel):
    period_days: int
    total_spend: float
    order_count: int
    return_count: int
    cancelled_count: int
    avg_order_value: float
    impulse_buy_count: int
    impulse_buy_percentage: float
    amazon_spend: float
    flipkart_spend: float
    amazon_order_count: int
    flipkart_order_count: int
    category_breakdown: List[CategoryBreakdown]
    daily_series: List[DailySpend]
    health_score: int
    health_label: str
    truvak_savings_estimate: float


class BuyerProfileResponse(BaseModel):
    customer_id_hash: str
    buyer_trust_score: int
    trust_level: str
    order_completion_rate: float
    return_rate: float
    cod_fulfillment_rate: float
    total_orders_analyzed: int
    improvement_tips: List[str]


class RecentOrderItem(BaseModel):
    id: int
    platform: str
    order_status: str
    order_value: float
    order_date: str


class RecentOrdersResponse(BaseModel):
    orders: List[RecentOrderItem]


def hash_order_id(order_id_raw: str) -> str:
    return hashlib.sha256(order_id_raw.encode()).hexdigest()


def parse_order_date(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        pass
    try:
        return datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid order_date format: {value}")


def compute_health_score(return_rate: float, cod_cancel_rate: float, impulse_ratio: float, completion_rate: float) -> int:
    score = 100.0
    score -= return_rate * 30
    score -= cod_cancel_rate * 20
    score -= impulse_ratio * 10
    score += completion_rate * 20
    return max(0, min(100, round(score)))


def compute_improvement_tips(return_rate: float, cod_cancel_rate: float, rto_rate: float) -> List[str]:
    tips: List[str] = []
    if return_rate > 0.3:
        tips.append("Consider providing size guides.")
    if cod_cancel_rate > 0.2:
        tips.append("Offer prepaid priority for COD orders.")
    if rto_rate > 0.15:
        tips.append("Enhance address verification process.")
    if not tips:
        tips.append("Great job. Keep maintaining delivery and quality consistency.")
    return tips


def _ensure_owner(path_customer_id_hash: str, token_customer_id_hash: str) -> None:
    if path_customer_id_hash != token_customer_id_hash:
        raise HTTPException(status_code=403, detail="Forbidden")


@router.post("/v1/customer/orders/sync", response_model=OrderSyncResponse)
async def sync_orders(
    request: OrderSyncRequest,
    customer_id_hash: str = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    synced_count = 0
    duplicate_count = 0

    for order in request.orders:
        order_id_hashed = hash_order_id(order.order_id_raw)
        existing = (
            db.query(CustomerOrder)
            .filter(CustomerOrder.order_id_hash == order_id_hashed)
            .first()
        )

        if existing:
            duplicate_count += 1
            continue

        row = CustomerOrder(
            customer_id_hash=customer_id_hash,
            order_id_hash=order_id_hashed,
            platform=order.platform.strip().lower(),
            product_category=order.product_category,
            order_value=order.order_value,
            order_date=parse_order_date(order.order_date),
            order_status=order.order_status.strip().lower(),
            is_cod=bool(order.is_cod),
            order_hour=order.order_hour,
        )
        db.add(row)
        synced_count += 1

    db.commit()

    total_stored = (
        db.query(CustomerOrder)
        .filter(CustomerOrder.customer_id_hash == customer_id_hash)
        .count()
    )

    return OrderSyncResponse(
        synced_count=synced_count,
        duplicate_count=duplicate_count,
        total_stored=total_stored,
        last_sync_at=datetime.utcnow().isoformat(),
    )


@router.get("/v1/customer/spend/{customer_id_hash}", response_model=SpendAnalysisResponse)
async def get_spend_analysis(
    customer_id_hash: str,
    days: int = Query(15, ge=1, le=365),
    token_customer_id_hash: str = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    _ensure_owner(customer_id_hash, token_customer_id_hash)

    now = datetime.utcnow()
    start_dt = now - timedelta(days=days)

    orders = (
        db.query(CustomerOrder)
        .filter(
            CustomerOrder.customer_id_hash == customer_id_hash,
            CustomerOrder.order_date >= start_dt,
            CustomerOrder.order_date <= now,
        )
        .all()
    )

    order_count = len(orders)
    total_spend = float(sum(float(order.order_value) for order in orders))
    return_count = sum(1 for order in orders if (order.order_status or "") == "returned")
    cancelled_count = sum(1 for order in orders if (order.order_status or "") == "cancelled")
    delivered_count = sum(1 for order in orders if (order.order_status or "") == "delivered")

    impulse_buy_count = sum(
        1
        for order in orders
        if order.order_hour is not None and (order.order_hour < 3 or order.order_hour > 21)
    )
    impulse_buy_percentage = (impulse_buy_count / order_count * 100) if order_count else 0.0

    amazon_orders = [order for order in orders if (order.platform or "") == "amazon"]
    flipkart_orders = [order for order in orders if (order.platform or "") == "flipkart"]
    amazon_spend = float(sum(float(order.order_value) for order in amazon_orders))
    flipkart_spend = float(sum(float(order.order_value) for order in flipkart_orders))

    category_map: Dict[str, Dict[str, float]] = {}
    for order in orders:
        category = (order.product_category or "unknown").strip() or "unknown"
        bucket = category_map.setdefault(
            category,
            {"total_spend": 0.0, "order_count": 0, "return_count": 0},
        )
        bucket["total_spend"] += float(order.order_value)
        bucket["order_count"] += 1
        if (order.order_status or "") == "returned":
            bucket["return_count"] += 1

    category_breakdown = [
        CategoryBreakdown(
            category=category,
            total_spend=round(float(data["total_spend"]), 2),
            order_count=int(data["order_count"]),
            return_count=int(data["return_count"]),
            percentage=round((data["total_spend"] / total_spend * 100), 2) if total_spend > 0 else 0.0,
        )
        for category, data in category_map.items()
    ]
    category_breakdown.sort(key=lambda x: x.total_spend, reverse=True)

    daily_map: Dict[str, Dict[str, float]] = {}
    for order in orders:
        day = order.order_date.date().isoformat()
        bucket = daily_map.setdefault(day, {"amazon": 0.0, "flipkart": 0.0})
        if (order.platform or "") == "amazon":
            bucket["amazon"] += float(order.order_value)
        elif (order.platform or "") == "flipkart":
            bucket["flipkart"] += float(order.order_value)

    daily_series = [
        DailySpend(
            date=day,
            amazon_spend=round(vals["amazon"], 2),
            flipkart_spend=round(vals["flipkart"], 2),
            total_spend=round(vals["amazon"] + vals["flipkart"], 2),
        )
        for day, vals in sorted(daily_map.items(), key=lambda x: x[0])
    ]

    completion_rate_ratio = (delivered_count / order_count) if order_count else 0.0
    return_rate_ratio = (return_count / order_count) if order_count else 0.0
    cod_orders = [order for order in orders if bool(order.is_cod)]
    cod_delivered = sum(1 for order in cod_orders if (order.order_status or "") == "delivered")
    cod_cancelled = sum(1 for order in cod_orders if (order.order_status or "") == "cancelled")
    cod_fulfillment_rate_ratio = (cod_delivered / len(cod_orders)) if cod_orders else 0.0
    cod_cancel_rate_ratio = (cod_cancelled / len(cod_orders)) if cod_orders else 0.0

    health_score = compute_health_score(
        return_rate=return_rate_ratio,
        cod_cancel_rate=cod_cancel_rate_ratio,
        impulse_ratio=(impulse_buy_count / order_count) if order_count else 0.0,
        completion_rate=completion_rate_ratio,
    )

    if health_score > 70:
        health_label = "HEALTHY"
    elif health_score > 45:
        health_label = "MODERATE"
    else:
        health_label = "NEEDS ATTENTION"

    avg_order_value = (total_spend / order_count) if order_count else 0.0
    truvak_savings_estimate = round(return_count * avg_order_value * 0.3, 2) if order_count else 0.0

    return SpendAnalysisResponse(
        period_days=days,
        total_spend=round(total_spend, 2),
        order_count=order_count,
        return_count=return_count,
        cancelled_count=cancelled_count,
        avg_order_value=round(avg_order_value, 2),
        impulse_buy_count=impulse_buy_count,
        impulse_buy_percentage=round(impulse_buy_percentage, 2),
        amazon_spend=round(amazon_spend, 2),
        flipkart_spend=round(flipkart_spend, 2),
        amazon_order_count=len(amazon_orders),
        flipkart_order_count=len(flipkart_orders),
        category_breakdown=category_breakdown,
        daily_series=daily_series,
        health_score=health_score,
        health_label=health_label,
        truvak_savings_estimate=truvak_savings_estimate,
    )


@router.get("/v1/customer/profile/{customer_id_hash}", response_model=BuyerProfileResponse)
async def get_buyer_profile(
    customer_id_hash: str,
    token_customer_id_hash: str = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    _ensure_owner(customer_id_hash, token_customer_id_hash)

    orders = (
        db.query(CustomerOrder)
        .filter(CustomerOrder.customer_id_hash == customer_id_hash)
        .all()
    )

    order_count = len(orders)
    delivered_count = sum(1 for order in orders if (order.order_status or "") == "delivered")
    returned_count = sum(1 for order in orders if (order.order_status or "") == "returned")
    cod_orders = [order for order in orders if bool(order.is_cod)]
    cod_delivered = sum(1 for order in cod_orders if (order.order_status or "") == "delivered")
    cod_cancelled = sum(1 for order in cod_orders if (order.order_status or "") == "cancelled")

    completion_rate_ratio = (delivered_count / order_count) if order_count else 0.0
    return_rate_ratio = (returned_count / order_count) if order_count else 0.0
    cod_fulfillment_rate_ratio = (cod_delivered / len(cod_orders)) if cod_orders else 0.0
    cod_cancel_rate_ratio = (cod_cancelled / len(cod_orders)) if cod_orders else 0.0

    buyer_trust_score = round(
        completion_rate_ratio * 40
        + cod_fulfillment_rate_ratio * 30
        + (1 - return_rate_ratio) * 30
    )

    if buyer_trust_score > 70:
        trust_level = "TRUSTED"
    elif buyer_trust_score > 45:
        trust_level = "NEUTRAL"
    else:
        trust_level = "RISKY"

    improvement_tips = compute_improvement_tips(
        return_rate=return_rate_ratio,
        cod_cancel_rate=cod_cancel_rate_ratio,
        rto_rate=(1 - completion_rate_ratio),
    )

    return BuyerProfileResponse(
        customer_id_hash=customer_id_hash,
        buyer_trust_score=buyer_trust_score,
        trust_level=trust_level,
        order_completion_rate=round(completion_rate_ratio * 100, 2),
        return_rate=round(return_rate_ratio * 100, 2),
        cod_fulfillment_rate=round(cod_fulfillment_rate_ratio * 100, 2),
        total_orders_analyzed=order_count,
        improvement_tips=improvement_tips,
    )


@router.get("/v1/customer/orders/recent", response_model=RecentOrdersResponse)
async def get_recent_orders(
    limit: int = Query(5, ge=1, le=25),
    customer_id_hash: str = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    orders = (
        db.query(CustomerOrder)
        .filter(CustomerOrder.customer_id_hash == customer_id_hash)
        .order_by(CustomerOrder.order_date.desc())
        .limit(limit)
        .all()
    )

    return RecentOrdersResponse(
        orders=[
            RecentOrderItem(
                id=int(order.id),
                platform=(order.platform or "unknown"),
                order_status=(order.order_status or "pending"),
                order_value=float(order.order_value),
                order_date=order.order_date.isoformat(),
            )
            for order in orders
        ]
    )


@router.post("/v1/customer/dark_mode", response_model=bool)
async def toggle_dark_mode(
    customer_id_hash: str = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS user_preferences (
                customer_id_hash TEXT PRIMARY KEY,
                dark_mode INTEGER NOT NULL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
    )

    row = db.execute(
        text("SELECT dark_mode FROM user_preferences WHERE customer_id_hash = :cid"),
        {"cid": customer_id_hash},
    ).fetchone()

    if row is None:
        new_dark_mode = True
        db.execute(
            text(
                "INSERT INTO user_preferences (customer_id_hash, dark_mode, updated_at) VALUES (:cid, :dark, :updated)"
            ),
            {"cid": customer_id_hash, "dark": 1, "updated": datetime.utcnow()},
        )
    else:
        new_dark_mode = not bool(row[0])
        db.execute(
            text(
                "UPDATE user_preferences SET dark_mode = :dark, updated_at = :updated WHERE customer_id_hash = :cid"
            ),
            {"cid": customer_id_hash, "dark": 1 if new_dark_mode else 0, "updated": datetime.utcnow()},
        )

    db.commit()
    return new_dark_mode
