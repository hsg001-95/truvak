"""
customer_models.py
==================
SQLAlchemy ORM models for the Truvak Customer Side.

Tables
------
1. customer_accounts       – hashed identity store
2. product_prices          – raw price observations (own + SellerMagnet)
3. product_price_summary   – pre-aggregated 15-day price window per product
4. customer_watchlist      – per-customer saved items & alert config
5. customer_orders         – anonymised order history
6. price_comparison_cache  – cross-platform match cache

Usage
-----
    from customer_models import Base, engine, init_customer_db
    init_customer_db()   # idempotent – safe to call on every startup
"""

import os
from datetime import datetime

from dotenv import load_dotenv

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# ---------------------------------------------------------------------------
# Engine / session factory
# ---------------------------------------------------------------------------

load_dotenv()

# DB lives alongside the existing trust.db in data/
_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
os.makedirs(_DATA_DIR, exist_ok=True)

_DEFAULT_SQLITE_URL = "sqlite:///" + os.path.abspath(os.path.join(_DATA_DIR, "truvak_customer.db"))
DATABASE_URL = (os.getenv("DATABASE_URL") or _DEFAULT_SQLITE_URL).strip()

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},  # required for SQLite + FastAPI
        echo=False,
    )
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        echo=False,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# ---------------------------------------------------------------------------
# Declarative base
# ---------------------------------------------------------------------------

class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# 1. customer_accounts
# ---------------------------------------------------------------------------

class CustomerAccount(Base):
    """
    Privacy-preserving customer identity.

    customer_id_hash : HMAC-SHA256 of the raw platform customer ID
    email_hash       : SHA-256 of the normalised e-mail address
    password_hash    : bcrypt hash (60-char)
    pin_code         : delivery/area PIN code (not PII on its own; used for
                       geographic risk analysis)
    """

    __tablename__ = "customer_accounts"

    id               = Column(Integer,    primary_key=True, autoincrement=True)
    customer_id_hash = Column(String(64), nullable=False, unique=True,
                              comment="HMAC-SHA256 of platform customer ID")
    email_hash       = Column(String(64), nullable=False, unique=True,
                              comment="SHA-256 of normalised e-mail")
    password_hash    = Column(String(72), nullable=False,
                              comment="bcrypt hash (60-char + headroom)")
    pin_code         = Column(String(10), nullable=True,
                              comment="Postal/PIN code for geo risk")
    created_at       = Column(DateTime,   nullable=False, default=datetime.utcnow)
    last_active      = Column(DateTime,   nullable=True,  onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<CustomerAccount id={self.id} hash={self.customer_id_hash[:8]}…>"


# ---------------------------------------------------------------------------
# 2. product_prices
# ---------------------------------------------------------------------------

class ProductPrice(Base):
    """
    Raw price observation for a single product on a single platform.

    source             : 'own' (Truvak crawler) | 'sellermagnet' (partner feed)
    data_quality_score : 0.0–1.0 confidence that the price is correct
    """

    __tablename__ = "product_prices"

    id                 = Column(Integer,   primary_key=True, autoincrement=True)
    product_id         = Column(String(64), nullable=False,
                                comment="ASIN (Amazon) or Flipkart product ID")
    platform           = Column(String(32), nullable=False,
                                comment="'amazon' | 'flipkart' | ...")
    price              = Column(Float,      nullable=False)
    source             = Column(String(32), nullable=False, default="own",
                                comment="'own' | 'sellermagnet'")
    data_quality_score = Column(Float,      nullable=False, default=1.0)
    observed_at        = Column(DateTime,   nullable=False, default=datetime.utcnow)

    def __repr__(self) -> str:
        return (
            f"<ProductPrice product={self.product_id} platform={self.platform} "
            f"price={self.price} observed={self.observed_at}>"
        )


# ---------------------------------------------------------------------------
# 3. product_price_summary
# ---------------------------------------------------------------------------

class ProductPriceSummary(Base):
    """
    Pre-aggregated 15-day rolling price summary, updated on each crawl cycle.

    trend_direction  : 'rising' | 'falling' | 'stable'
    deal_indicator   : True when current_price < price_15d_low * 0.95
    confidence_label : 'high' | 'medium' | 'low' (driven by data_points_count)
    """

    __tablename__ = "product_price_summary"

    # Composite PK – one summary row per (product, platform)
    product_id        = Column(String(64), primary_key=True)
    platform          = Column(String(32), primary_key=True)

    price_15d_low     = Column(Float,       nullable=True)
    price_15d_high    = Column(Float,       nullable=True)
    price_15d_avg     = Column(Float,       nullable=True)
    current_price     = Column(Float,       nullable=True)
    data_points_count = Column(Integer,     nullable=False, default=0)
    trend_direction   = Column(String(16),  nullable=True,
                               comment="'rising' | 'falling' | 'stable'")
    deal_indicator    = Column(Boolean,     nullable=False, default=False)
    confidence_label  = Column(String(16),  nullable=True,
                               comment="'high' | 'medium' | 'low'")
    last_updated      = Column(DateTime,    nullable=False, default=datetime.utcnow,
                               onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        return (
            f"<ProductPriceSummary product={self.product_id} "
            f"platform={self.platform} current={self.current_price} "
            f"deal={self.deal_indicator}>"
        )


# ---------------------------------------------------------------------------
# 4. customer_watchlist
# ---------------------------------------------------------------------------

class CustomerWatchlist(Base):
    """
    A customer's saved product with optional price-drop alert configuration.

    alert_threshold_pct : e.g. 10.0 → alert when price drops ≥10 % below price_at_save
    alert_sent          : True after notification is dispatched (reset on ack)
    is_active           : False = soft-deleted from watchlist
    """

    __tablename__ = "customer_watchlist"

    id                  = Column(Integer,   primary_key=True, autoincrement=True)
    customer_id_hash    = Column(String(64), nullable=False,
                                 comment="FK → customer_accounts.customer_id_hash")
    product_id          = Column(String(64), nullable=False)
    platform            = Column(String(32), nullable=False)
    product_name        = Column(Text,       nullable=True)
    product_url         = Column(Text,       nullable=True)
    price_at_save       = Column(Float,      nullable=True,
                                 comment="Price when the item was added")
    current_price       = Column(Float,      nullable=True,
                                 comment="Most recently observed price")
    alert_threshold_pct = Column(Float,      nullable=True, default=10.0,
                                 comment="Percentage drop to trigger alert")
    last_checked        = Column(DateTime,   nullable=True)
    alert_sent          = Column(Boolean,    nullable=False, default=False)
    is_active           = Column(Boolean,    nullable=False, default=True)

    def __repr__(self) -> str:
        return (
            f"<CustomerWatchlist id={self.id} customer={self.customer_id_hash[:8]}… "
            f"product={self.product_id} active={self.is_active}>"
        )


# ---------------------------------------------------------------------------
# 5. customer_orders
# ---------------------------------------------------------------------------

class CustomerOrder(Base):
    """
    Anonymised order record for behavioural analytics and trust scoring.

    order_id_hash : SHA-256 of the raw platform order ID
    order_status  : 'delivered' | 'returned' | 'cancelled' | 'pending'
    is_cod        : Cash-on-Delivery flag (key trust-model feature)
    order_hour    : 0–23 hour extracted from order timestamp (privacy-safe)
    """

    __tablename__ = "customer_orders"

    id               = Column(Integer,    primary_key=True, autoincrement=True)
    customer_id_hash = Column(String(64), nullable=False,
                              comment="FK → customer_accounts.customer_id_hash")
    order_id_hash    = Column(String(64), nullable=False, unique=True,
                              comment="SHA-256 of platform order ID")
    platform         = Column(String(32), nullable=False)
    product_category = Column(String(64), nullable=True)
    order_value      = Column(Float,      nullable=False)
    order_date       = Column(DateTime,   nullable=False)
    order_status     = Column(String(32), nullable=False,
                              comment="'delivered'|'returned'|'cancelled'|'pending'")
    is_cod           = Column(Boolean,    nullable=False, default=False)
    order_hour       = Column(Integer,    nullable=True,
                              comment="Hour-of-day (0-23) for behaviour analysis")

    def __repr__(self) -> str:
        return (
            f"<CustomerOrder id={self.id} hash={self.order_id_hash[:8]}… "
            f"value={self.order_value} status={self.order_status}>"
        )


# ---------------------------------------------------------------------------
# 6. price_comparison_cache
# ---------------------------------------------------------------------------

class PriceComparisonCache(Base):
    """
    Short-lived cache for cross-platform product-match results.

    source_product_id : Product ID on the source platform
    compared_platform : Platform we searched on
    matched_price     : Best price found on compared_platform
    confidence_level  : 0.0–1.0 similarity score of the product match
    match_method      : 'title_similarity' | 'barcode' | 'asin_lookup' | ...
    expires_at        : Cache TTL; stale rows should be purged / ignored
    """

    __tablename__ = "price_comparison_cache"

    id                = Column(Integer,    primary_key=True, autoincrement=True)
    source_product_id = Column(String(64), nullable=False,
                               comment="Product ID on the source platform")
    compared_platform = Column(String(32), nullable=False)
    matched_price     = Column(Float,      nullable=True)
    confidence_level  = Column(Float,      nullable=True,
                               comment="0.0–1.0 match similarity")
    match_method      = Column(String(32), nullable=True,
                               comment="'title_similarity'|'barcode'|'asin_lookup'")
    cached_at         = Column(DateTime,   nullable=False, default=datetime.utcnow)
    expires_at        = Column(DateTime,   nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "source_product_id", "compared_platform",
            name="uq_price_cache_source_platform",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<PriceComparisonCache src={self.source_product_id} "
            f"platform={self.compared_platform} expires={self.expires_at}>"
        )


# ---------------------------------------------------------------------------
# 7. selector_health_reports
# ---------------------------------------------------------------------------

class SelectorHealthReport(Base):
    """
    Selector extraction health report from extension runtime.

    checked_fields_json : JSON array of fields attempted for extraction
    failed_fields_json  : JSON array of fields that failed extraction
    url_pattern         : normalized path (e.g., /dp/ASIN)
    """

    __tablename__ = "selector_health_reports"

    id                 = Column(Integer,    primary_key=True, autoincrement=True)
    platform           = Column(String(32), nullable=False)
    checked_fields_json = Column(Text,      nullable=False, default="[]")
    failed_fields_json = Column(Text,       nullable=False, default="[]")
    url_pattern        = Column(String(255), nullable=True)
    reported_at        = Column(DateTime,   nullable=False, default=datetime.utcnow)

    def __repr__(self) -> str:
        return (
            f"<SelectorHealthReport id={self.id} platform={self.platform} "
            f"reported_at={self.reported_at}>"
        )


# ---------------------------------------------------------------------------
# Explicit index definitions (created via checkfirst=True for idempotency)
# ---------------------------------------------------------------------------

_INDEXES = [
    # customer_accounts
    Index("ix_customer_accounts_customer_id_hash",
          CustomerAccount.__table__.c.customer_id_hash),
    Index("ix_customer_accounts_email_hash",
          CustomerAccount.__table__.c.email_hash),

    # product_prices
    Index("ix_product_prices_product_platform",
          ProductPrice.__table__.c.product_id,
          ProductPrice.__table__.c.platform),
    Index("ix_product_prices_observed_at",
          ProductPrice.__table__.c.observed_at),

    # product_price_summary
    Index("ix_product_price_summary_product_platform",
          ProductPriceSummary.__table__.c.product_id,
          ProductPriceSummary.__table__.c.platform),

    # customer_watchlist
    Index("ix_customer_watchlist_customer_id_hash",
          CustomerWatchlist.__table__.c.customer_id_hash),
    Index("ix_customer_watchlist_product_platform",
          CustomerWatchlist.__table__.c.product_id,
          CustomerWatchlist.__table__.c.platform),

    # customer_orders
    Index("ix_customer_orders_customer_id_hash",
          CustomerOrder.__table__.c.customer_id_hash),
    Index("ix_customer_orders_order_date",
          CustomerOrder.__table__.c.order_date),

    # price_comparison_cache
    Index("ix_price_comparison_cache_source",
          PriceComparisonCache.__table__.c.source_product_id),
    Index("ix_price_comparison_cache_expires",
          PriceComparisonCache.__table__.c.expires_at),

        # selector_health_reports
        Index("ix_selector_health_reports_platform",
            SelectorHealthReport.__table__.c.platform),
        Index("ix_selector_health_reports_reported_at",
            SelectorHealthReport.__table__.c.reported_at),
]


# ---------------------------------------------------------------------------
# DB initialiser – idempotent, safe to call on every app startup
# ---------------------------------------------------------------------------

def init_customer_db() -> None:
    """
    Create all customer-side tables and indexes.
    Safe to call repeatedly – uses CREATE TABLE IF NOT EXISTS and
    checkfirst=True for indexes.
    """
    Base.metadata.create_all(bind=engine)          # tables (always idempotent)
    for idx in _INDEXES:
        idx.create(bind=engine, checkfirst=True)   # indexes (skip if exists)
    print(f"[customer_models] Customer DB ready → {DATABASE_URL}")


# FastAPI dependency
def get_db():
    """Yield a DB session; ensures the session is always closed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


if __name__ == "__main__":
    init_customer_db()
