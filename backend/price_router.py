from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.customer_auth_router import get_current_customer
from backend.customer_models import (
    PriceComparisonCache,
    ProductPrice,
    ProductPriceSummary,
    SessionLocal,
    get_db,
)

router = APIRouter()

ALLOWED_PLATFORMS = ["amazon", "flipkart", "croma", "tatacliq", "meesho", "myntra"]


class PricePointRequest(BaseModel):
    product_id: str
    platform: str
    price: float
    title: Optional[str] = None
    category: Optional[str] = None

    @field_validator("platform")
    @classmethod
    def validate_platform(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in ALLOWED_PLATFORMS:
            raise ValueError(f"Invalid platform: {value}. Must be one of {ALLOWED_PLATFORMS}")
        return normalized

    @field_validator("price")
    @classmethod
    def validate_price(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("Price must be greater than 0")
        return value


class PriceBatchRequest(BaseModel):
    items: List[PricePointRequest]
    source: str = "own"


class BestsellerItem(BaseModel):
    product_id: str
    price: float
    title: Optional[str] = None
    category: Optional[str] = None
    rank: Optional[int] = None

    @field_validator("price")
    @classmethod
    def check_price(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("Price must be greater than 0")
        return value


class BestsellerBatchRequest(BaseModel):
    items: List[BestsellerItem]
    category_page: str
    page_url: str

    @field_validator("items")
    @classmethod
    def check_items(cls, value: List[BestsellerItem]) -> List[BestsellerItem]:
        if len(value) > 100:
            raise ValueError("Too many items (max 100)")
        return value


class BestsellerBatchResponse(BaseModel):
    inserted_count: int
    skipped_count: int
    summaries_updated: int
    category_page: str


class SparklinePoint(BaseModel):
    date: str
    price: float


class PriceHistoryResponse(BaseModel):
    product_id: str
    platform: str
    sparkline_data: List[SparklinePoint]
    price_15d_low: Optional[float]
    price_15d_high: Optional[float]
    price_15d_avg: Optional[float]
    current_price: Optional[float]
    data_points_count: int
    trend_direction: str
    deal_indicator: str
    confidence_label: str
    last_updated: Optional[str]


class PriceCompareResult(BaseModel):
    platform: str
    price: Optional[float]
    confidence_level: str
    match_method: str
    savings: Optional[float]
    is_cheapest: bool


class PriceCompareResponse(BaseModel):
    source_product_id: str
    source_price: float
    comparisons: List[PriceCompareResult]
    best_price_platform: Optional[str]
    best_price: Optional[float]
    max_savings: Optional[float]
    cached: bool
    cache_age_minutes: Optional[int]


class PriceCompareUpsertRequest(BaseModel):
    source_product_id: str
    compared_platform: str
    matched_price: Optional[float] = Field(default=None, gt=0)
    confidence_level: float = Field(default=0.5, ge=0, le=1)
    match_method: str = "unknown"
    ttl_minutes: int = Field(default=60, ge=1, le=1440)

    @field_validator("compared_platform")
    @classmethod
    def validate_compared_platform(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in ALLOWED_PLATFORMS:
            raise ValueError(f"Invalid platform: {value}. Must be one of {ALLOWED_PLATFORMS}")
        return normalized


class PricePointResponse(BaseModel):
    product_id: str
    platform: str
    sparkline_data: List[SparklinePoint]


def _compute_trend_direction(prices: List[float]) -> str:
    count = len(prices)
    if count < 3:
        return "STABLE"

    last_3_avg = sum(prices[-3:]) / 3
    overall_avg = sum(prices) / count

    if last_3_avg > overall_avg * 1.05:
        return "RISING"
    if last_3_avg < overall_avg * 0.95:
        return "FALLING"
    return "STABLE"


def _compute_deal_indicator(current_price: float, avg_price: float, count: int) -> str:
    if count < 4:
        return "INSUFFICIENT_DATA"
    if current_price < avg_price * 0.92:
        return "GOOD_DEAL"
    if current_price > avg_price * 1.08:
        return "OVERPRICED"
    return "FAIR_PRICE"


def _compute_confidence_label(count: int) -> str:
    if count >= 10:
        return f"High confidence ({count} observations)"
    if count >= 4:
        return f"Limited history ({count} observations)"
    if count >= 1:
        return f"Very limited data ({count} observations)"
    return "No history yet - be the first to track this"


def _confidence_float_to_label(value: Optional[float]) -> str:
    if value is None:
        return "unknown"
    if value >= 0.8:
        return "high"
    if value >= 0.5:
        return "medium"
    return "low"


def _get_sparkline_data(db: Session, product_id: str, platform: str) -> List[SparklinePoint]:
    cutoff = datetime.utcnow() - timedelta(days=15)
    rows = (
        db.query(
            func.date(ProductPrice.observed_at).label("day"),
            func.max(ProductPrice.price).label("price"),
        )
        .filter(
            ProductPrice.product_id == product_id,
            ProductPrice.platform == platform,
            ProductPrice.observed_at >= cutoff,
        )
        .group_by(func.date(ProductPrice.observed_at))
        .order_by(func.date(ProductPrice.observed_at).asc())
        .all()
    )

    return [SparklinePoint(date=str(row.day), price=float(row.price)) for row in rows]


def compute_price_summary(product_id: str, platform: str, db: Session) -> Optional[ProductPriceSummary]:
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
    count = len(prices)

    trend_direction = _compute_trend_direction(prices)
    deal_indicator = _compute_deal_indicator(current_price, avg, count)
    confidence_label = _compute_confidence_label(count)

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
    summary.data_points_count = count
    summary.trend_direction = trend_direction
    summary.deal_indicator = deal_indicator == "GOOD_DEAL"
    summary.confidence_label = confidence_label
    summary.last_updated = datetime.utcnow()

    db.commit()
    db.refresh(summary)
    return summary


def _compute_price_summary_background(product_id: str, platform: str) -> None:
    db = SessionLocal()
    try:
        compute_price_summary(product_id, platform, db)
    finally:
        db.close()


@router.post("/v1/product/price-point", response_model=PricePointResponse)
async def add_price_point(
    price_point: PricePointRequest,
    background_tasks: BackgroundTasks,
    _customer_id_hash: str = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    product_id = price_point.product_id.strip()
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id is required")

    point = ProductPrice(
        product_id=product_id,
        platform=price_point.platform,
        price=price_point.price,
        source="own",
        data_quality_score=1.0,
        observed_at=datetime.utcnow(),
    )
    db.add(point)
    db.commit()

    summary = (
        db.query(ProductPriceSummary)
        .filter(
            ProductPriceSummary.product_id == product_id,
            ProductPriceSummary.platform == price_point.platform,
        )
        .first()
    )

    count_query = db.query(ProductPrice).filter(
        ProductPrice.product_id == product_id,
        ProductPrice.platform == price_point.platform,
    )
    if summary:
        count_query = count_query.filter(ProductPrice.observed_at > summary.last_updated)

    if count_query.count() >= 10:
        background_tasks.add_task(_compute_price_summary_background, product_id, price_point.platform)

    sparkline_data = _get_sparkline_data(db, product_id, price_point.platform)

    return PricePointResponse(
        product_id=product_id,
        platform=price_point.platform,
        sparkline_data=sparkline_data,
    )


@router.post("/v1/product/price-batch")
async def add_price_batch(
    price_batch: PriceBatchRequest,
    _customer_id_hash: str = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    if not price_batch.items:
        raise HTTPException(status_code=400, detail="items cannot be empty")

    now = datetime.utcnow()
    rows = [
        ProductPrice(
            product_id=item.product_id.strip(),
            platform=item.platform,
            price=item.price,
            source=price_batch.source,
            data_quality_score=1.0,
            observed_at=now,
        )
        for item in price_batch.items
    ]

    db.add_all(rows)
    db.commit()

    unique_pairs = {(item.product_id.strip(), item.platform) for item in price_batch.items}
    updated_summaries_count = 0

    for product_id, platform in unique_pairs:
        count = (
            db.query(ProductPrice)
            .filter(ProductPrice.product_id == product_id, ProductPrice.platform == platform)
            .count()
        )
        if count >= 3 and compute_price_summary(product_id, platform, db):
            updated_summaries_count += 1

    return {
        "inserted_count": len(rows),
        "updated_summaries_count": updated_summaries_count,
    }


@router.post("/v1/product/bestseller-batch", response_model=BestsellerBatchResponse)
async def post_bestseller_batch(
    batch_request: BestsellerBatchRequest,
    db: Session = Depends(get_db),
):
    valid_items = [
        item
        for item in batch_request.items
        if item.product_id and item.product_id.strip() and item.price > 0
    ]

    now = datetime.utcnow()
    rows = [
        ProductPrice(
            product_id=item.product_id.strip(),
            platform="amazon",
            price=item.price,
            source="own",
            data_quality_score=0.9,
            observed_at=now,
        )
        for item in valid_items
    ]

    if rows:
        db.add_all(rows)
        db.commit()

    inserted_count = len(rows)
    skipped_count = len(batch_request.items) - inserted_count

    unique_pairs = {(item.product_id.strip(), "amazon") for item in valid_items}
    summaries_updated = 0

    for product_id, platform in unique_pairs:
        count = (
            db.query(ProductPrice)
            .filter(ProductPrice.product_id == product_id, ProductPrice.platform == platform)
            .count()
        )
        if count >= 10 and compute_price_summary(product_id, platform, db):
            summaries_updated += 1

    return BestsellerBatchResponse(
        inserted_count=inserted_count,
        skipped_count=skipped_count,
        summaries_updated=summaries_updated,
        category_page=batch_request.category_page,
    )


@router.get("/v1/product/price-history/{product_id}", response_model=PriceHistoryResponse)
async def get_price_history(
    product_id: str,
    platform: str = Query("amazon"),
    _customer_id_hash: str = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    normalized_product_id = product_id.strip()
    normalized_platform = platform.strip().lower()

    if normalized_platform not in ALLOWED_PLATFORMS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid platform: {platform}. Must be one of {ALLOWED_PLATFORMS}",
        )
    if not normalized_product_id:
        raise HTTPException(status_code=400, detail="product_id is required")

    summary = (
        db.query(ProductPriceSummary)
        .filter(
            ProductPriceSummary.product_id == normalized_product_id,
            ProductPriceSummary.platform == normalized_platform,
        )
        .first()
    )

    if summary and summary.last_updated and (datetime.utcnow() - summary.last_updated) < timedelta(hours=2):
        is_fresh = True
    else:
        is_fresh = False
        summary = compute_price_summary(normalized_product_id, normalized_platform, db)

    sparkline_data = _get_sparkline_data(db, normalized_product_id, normalized_platform)

    if not summary:
        raise HTTPException(status_code=404, detail="No price history found for this product/platform")

    if summary.data_points_count < 4:
        deal_indicator = "INSUFFICIENT_DATA"
    elif summary.current_price is not None and summary.price_15d_avg is not None and summary.current_price < summary.price_15d_avg * 0.92:
        deal_indicator = "GOOD_DEAL"
    elif summary.current_price is not None and summary.price_15d_avg is not None and summary.current_price > summary.price_15d_avg * 1.08:
        deal_indicator = "OVERPRICED"
    else:
        deal_indicator = "FAIR_PRICE"

    confidence_label = summary.confidence_label or _compute_confidence_label(int(summary.data_points_count))
    if is_fresh:
        confidence_label = f"{confidence_label} (cached)"

    return PriceHistoryResponse(
        product_id=normalized_product_id,
        platform=normalized_platform,
        sparkline_data=sparkline_data,
        price_15d_low=round(float(summary.price_15d_low), 2) if summary.price_15d_low is not None else None,
        price_15d_high=round(float(summary.price_15d_high), 2) if summary.price_15d_high is not None else None,
        price_15d_avg=round(float(summary.price_15d_avg), 2) if summary.price_15d_avg is not None else None,
        current_price=round(float(summary.current_price), 2) if summary.current_price is not None else None,
        data_points_count=int(summary.data_points_count),
        trend_direction=(summary.trend_direction or "STABLE"),
        deal_indicator=deal_indicator,
        confidence_label=confidence_label,
        last_updated=summary.last_updated.isoformat() if summary.last_updated else None,
    )


@router.get("/v1/product/price-compare/{product_id}", response_model=PriceCompareResponse)
async def get_price_compare(
    product_id: str,
    platform: str = Query("amazon"),
    source_price: float = Query(..., gt=0),
    _customer_id_hash: str = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    normalized_product_id = product_id.strip()
    normalized_platform = platform.strip().lower()

    if not normalized_product_id:
        raise HTTPException(status_code=400, detail="product_id is required")

    rows = (
        db.query(PriceComparisonCache)
        .filter(PriceComparisonCache.source_product_id == normalized_product_id)
        .order_by(PriceComparisonCache.cached_at.desc())
        .all()
    )

    now = datetime.utcnow()
    comparisons: List[PriceCompareResult] = []
    candidate_prices = []
    candidate_platform_map = {}

    for row in rows:
        price = float(row.matched_price) if row.matched_price is not None else None
        if price is not None:
            candidate_prices.append(price)
            candidate_platform_map[price] = row.compared_platform

        comparisons.append(
            PriceCompareResult(
                platform=row.compared_platform,
                price=price,
                confidence_level=_confidence_float_to_label(row.confidence_level),
                match_method=row.match_method or "unknown",
                savings=round(source_price - price, 2) if price is not None else None,
                is_cheapest=False,
            )
        )

    best_price = min(candidate_prices) if candidate_prices else None
    best_price_platform = candidate_platform_map.get(best_price) if best_price is not None else None

    for comp in comparisons:
        comp.is_cheapest = best_price is not None and comp.price == best_price

    freshest = rows[0] if rows else None
    cache_age_minutes = None
    if freshest and freshest.cached_at:
        cache_age_minutes = int((now - freshest.cached_at).total_seconds() // 60)

    cached = bool(rows) and all(row.expires_at > now for row in rows)

    return PriceCompareResponse(
        source_product_id=normalized_product_id,
        source_price=source_price,
        comparisons=comparisons,
        best_price_platform=best_price_platform,
        best_price=best_price,
        max_savings=round(source_price - best_price, 2) if best_price is not None else None,
        cached=cached,
        cache_age_minutes=cache_age_minutes,
    )


@router.post("/v1/product/price-compare")
async def add_price_compare(
    payload: PriceCompareUpsertRequest,
    _customer_id_hash: str = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()
    expires_at = now + timedelta(minutes=payload.ttl_minutes)

    row = (
        db.query(PriceComparisonCache)
        .filter(
            PriceComparisonCache.source_product_id == payload.source_product_id.strip(),
            PriceComparisonCache.compared_platform == payload.compared_platform,
        )
        .first()
    )

    if row is None:
        row = PriceComparisonCache(
            source_product_id=payload.source_product_id.strip(),
            compared_platform=payload.compared_platform,
        )
        db.add(row)

    row.matched_price = payload.matched_price
    row.confidence_level = payload.confidence_level
    row.match_method = payload.match_method
    row.cached_at = now
    row.expires_at = expires_at

    db.commit()

    return {"message": "Price comparison added successfully"}
