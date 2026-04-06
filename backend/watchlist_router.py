from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from backend.customer_auth_router import get_current_customer
from backend.customer_models import CustomerAccount, CustomerWatchlist, get_db

router = APIRouter()

ALLOWED_PLATFORMS = ["amazon", "flipkart", "croma", "tatacliq", "meesho", "myntra"]


class WatchlistAddRequest(BaseModel):
    product_id: str
    platform: str
    product_name: str
    product_url: str
    price_at_save: float = Field(..., gt=0)
    alert_threshold_pct: float = Field(default=5.0, ge=0)

    @field_validator("platform")
    @classmethod
    def validate_platform(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in ALLOWED_PLATFORMS:
            raise ValueError(f"Invalid platform: {value}. Must be one of {ALLOWED_PLATFORMS}")
        return normalized


class WatchlistUpdateRequest(BaseModel):
    current_price: Optional[float] = Field(default=None, gt=0)
    alert_threshold_pct: Optional[float] = Field(default=None, ge=0)


class WatchlistItem(BaseModel):
    id: int
    product_id: str
    platform: str
    product_name: str
    product_url: str
    price_at_save: float
    current_price: Optional[float]
    change_pct: Optional[float]
    change_direction: str
    alert_threshold_pct: float
    alert_triggered: bool
    alert_sent: bool
    last_checked: Optional[str]
    created_at: str


class WatchlistCheckItem(BaseModel):
    id: int
    product_id: str
    product_url: str
    product_name: str
    price_at_save: float
    alert_threshold_pct: float
    platform: str


def compute_change_pct(price_at_save: float, current_price: Optional[float]) -> Optional[float]:
    if current_price is None or price_at_save <= 0:
        return None
    return round((current_price - price_at_save) / price_at_save * 100, 2)


def _ensure_customer_exists(db: Session, customer_id_hash: str) -> None:
    # JWT auth already validated this identity in get_current_customer.
    # Some environments keep auth and customer analytics stores decoupled,
    # so missing mirrored account rows should not block watchlist APIs.
    if not customer_id_hash or not str(customer_id_hash).strip():
        raise HTTPException(status_code=401, detail="Unauthorized")


def _serialize_item(item: CustomerWatchlist) -> WatchlistItem:
    current_price = float(item.current_price) if item.current_price is not None else None
    price_at_save = float(item.price_at_save)
    change_pct = compute_change_pct(price_at_save, current_price)

    if change_pct is None or change_pct == 0:
        change_direction = "unchanged"
    elif change_pct > 0:
        change_direction = "up"
    else:
        change_direction = "down"

    alert_triggered = False
    if current_price is not None and price_at_save > 0:
        drop_threshold_price = price_at_save * (1 - float(item.alert_threshold_pct) / 100)
        alert_triggered = current_price <= drop_threshold_price and not bool(item.alert_sent)

    created_at = item.last_checked.isoformat() if item.last_checked else datetime.utcnow().isoformat()

    return WatchlistItem(
        id=item.id,
        product_id=item.product_id,
        platform=item.platform,
        product_name=item.product_name or "",
        product_url=item.product_url or "",
        price_at_save=price_at_save,
        current_price=current_price,
        change_pct=change_pct,
        change_direction=change_direction,
        alert_threshold_pct=float(item.alert_threshold_pct or 5.0),
        alert_triggered=alert_triggered,
        alert_sent=bool(item.alert_sent),
        last_checked=item.last_checked.isoformat() if item.last_checked else None,
        created_at=created_at,
    )


@router.post("/v1/customer/watchlist", response_model=WatchlistItem)
async def add_watchlist_item(
    request: WatchlistAddRequest,
    customer_id_hash: str = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    _ensure_customer_exists(db, customer_id_hash)

    product_id = request.product_id.strip()
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id is required")

    existing_item = (
        db.query(CustomerWatchlist)
        .filter(
            CustomerWatchlist.customer_id_hash == customer_id_hash,
            CustomerWatchlist.product_id == product_id,
            CustomerWatchlist.platform == request.platform,
            CustomerWatchlist.is_active.is_(True),
        )
        .first()
    )
    if existing_item:
        raise HTTPException(status_code=409, detail="Item already exists and is active")

    item = CustomerWatchlist(
        customer_id_hash=customer_id_hash,
        product_id=product_id,
        platform=request.platform,
        product_name=request.product_name.strip(),
        product_url=request.product_url.strip(),
        price_at_save=request.price_at_save,
        alert_threshold_pct=request.alert_threshold_pct or 5.0,
        is_active=True,
        alert_sent=False,
        current_price=None,
        last_checked=None,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    return _serialize_item(item)


@router.get("/v1/customer/watchlist", response_model=List[WatchlistItem])
async def get_watchlist_items(
    customer_id_hash: str = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    _ensure_customer_exists(db, customer_id_hash)

    items = (
        db.query(CustomerWatchlist)
        .filter(
            CustomerWatchlist.customer_id_hash == customer_id_hash,
            CustomerWatchlist.is_active.is_(True),
        )
        .order_by(CustomerWatchlist.id.desc())
        .all()
    )

    return [_serialize_item(item) for item in items]


@router.patch("/v1/customer/watchlist/{watchlist_id}", response_model=WatchlistItem)
async def update_watchlist_item(
    watchlist_id: int,
    request: WatchlistUpdateRequest,
    customer_id_hash: str = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    _ensure_customer_exists(db, customer_id_hash)

    item = (
        db.query(CustomerWatchlist)
        .filter(
            CustomerWatchlist.id == watchlist_id,
            CustomerWatchlist.customer_id_hash == customer_id_hash,
            CustomerWatchlist.is_active.is_(True),
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if request.current_price is not None:
        item.current_price = request.current_price
        item.last_checked = datetime.utcnow()

    if request.alert_threshold_pct is not None:
        item.alert_threshold_pct = request.alert_threshold_pct

    db.commit()
    db.refresh(item)

    return _serialize_item(item)


@router.post("/v1/customer/watchlist/{watchlist_id}/alert-sent")
async def set_alert_sent(
    watchlist_id: int,
    customer_id_hash: str = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    _ensure_customer_exists(db, customer_id_hash)

    item = (
        db.query(CustomerWatchlist)
        .filter(
            CustomerWatchlist.id == watchlist_id,
            CustomerWatchlist.customer_id_hash == customer_id_hash,
            CustomerWatchlist.is_active.is_(True),
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    item.alert_sent = True
    item.last_checked = datetime.utcnow()
    db.commit()

    return {"message": "Alert sent status updated"}


@router.post("/v1/customer/watchlist/check-prices", response_model=List[WatchlistCheckItem])
async def check_watchlist_prices(
    customer_id_hash: str = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    _ensure_customer_exists(db, customer_id_hash)

    cutoff = datetime.utcnow() - timedelta(hours=6)
    items = (
        db.query(CustomerWatchlist)
        .filter(
            CustomerWatchlist.customer_id_hash == customer_id_hash,
            CustomerWatchlist.is_active.is_(True),
        )
        .all()
    )

    result = [
        item
        for item in items
        if item.last_checked is None or item.last_checked < cutoff
    ]

    return [
        WatchlistCheckItem(
            id=item.id,
            product_id=item.product_id,
            product_url=item.product_url or "",
            product_name=item.product_name or "",
            price_at_save=float(item.price_at_save),
            alert_threshold_pct=float(item.alert_threshold_pct or 5.0),
            platform=item.platform,
        )
        for item in result
    ]


@router.delete("/v1/customer/watchlist/{watchlist_id}")
async def delete_watchlist_item(
    watchlist_id: int,
    customer_id_hash: str = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    _ensure_customer_exists(db, customer_id_hash)

    item = (
        db.query(CustomerWatchlist)
        .filter(
            CustomerWatchlist.id == watchlist_id,
            CustomerWatchlist.customer_id_hash == customer_id_hash,
            CustomerWatchlist.is_active.is_(True),
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    item.is_active = False
    item.last_checked = datetime.utcnow()
    db.commit()

    return {"message": "Item deleted"}
