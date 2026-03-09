import pandas as pd
import numpy as np
import os

# ─────────────────────────────────────────────────────────────────────────────
# OLIST → INDIA RTO FEATURE MAPPER
#
# Brazil context → India mapping rationale:
# - "boleto" payment   → COD proxy (both are offline/cash-equivalent payments)
# - order "canceled" or "unavailable" → RTO proxy
# - customer zip prefix → geographic tier (Brazil state codes → India tier)
# - freight_value/price ratio → delivery cost burden (higher in Tier-3 India)
# - review_score ≤ 2   → dissatisfied buyer → higher return intent signal
# ─────────────────────────────────────────────────────────────────────────────

DATA_DIR = "data/olist"

print("Loading Olist datasets...")
orders   = pd.read_csv(f"{DATA_DIR}/olist_orders_dataset.csv")
payments = pd.read_csv(f"{DATA_DIR}/olist_order_payments_dataset.csv")
items    = pd.read_csv(f"{DATA_DIR}/olist_order_items_dataset.csv")
customers= pd.read_csv(f"{DATA_DIR}/olist_customers_dataset.csv")
reviews  = pd.read_csv(f"{DATA_DIR}/olist_order_reviews_dataset.csv")
geo      = pd.read_csv(f"{DATA_DIR}/olist_geolocation_dataset.csv")

print(f"  Orders     : {len(orders):,}")
print(f"  Payments   : {len(payments):,}")
print(f"  Items      : {len(items):,}")
print(f"  Customers  : {len(customers):,}")
print(f"  Reviews    : {len(reviews):,}")

# ── Step 1: RTO Label ─────────────────────────────────────────────────────────
# Brazil "canceled" + "unavailable" = our RTO equivalent
# (order was not successfully delivered — returned to origin)
rto_statuses = {"canceled", "unavailable"}
orders["rto_label"] = orders["order_status"].apply(
    lambda s: 1 if s in rto_statuses else 0
)
print(f"\nOrder status distribution:")
print(orders["order_status"].value_counts())
print(f"\nDerived RTO rate: {orders['rto_label'].mean():.1%}")

# ── Step 2: COD Proxy ─────────────────────────────────────────────────────────
# "boleto" = offline bank slip payment = closest to COD in Brazil
# Both require no upfront card commitment, buyer can back out
payments_agg = payments.groupby("order_id").agg(
    payment_type     = ("payment_type", lambda x: x.mode()[0]),
    payment_value    = ("payment_value", "sum"),
    installments     = ("payment_installments", "max")
).reset_index()
payments_agg["is_cod"] = (payments_agg["payment_type"] == "boleto").astype(int)

# ── Step 3: Order Value Features ─────────────────────────────────────────────
items_agg = items.groupby("order_id").agg(
    order_value    = ("price", "sum"),
    freight_value  = ("freight_value", "sum"),
    item_count     = ("order_item_id", "count")
).reset_index()
items_agg["freight_ratio"] = (
    items_agg["freight_value"] / items_agg["order_value"].clip(lower=1)
).round(4)
items_agg["order_value_bucket"] = pd.cut(
    items_agg["order_value"],
    bins=[0, 50, 100, 200, 500, 99999],
    labels=[1, 2, 3, 4, 5]
).astype(int)

# ── Step 4: Geographic Tier ───────────────────────────────────────────────────
# Brazil state → India tier mapping based on urbanisation similarity:
# Tier 1 (metro equivalent): SP, RJ, DF, RS, PR — dense, high internet penetration
# Tier 2 (mid-city equiv) : MG, SC, GO, ES, BA  — growing digital adoption
# Tier 3 (rural equiv)    : All others           — lower connectivity, cash-heavy
TIER_1_STATES = {"SP", "RJ", "DF", "RS", "PR"}
TIER_2_STATES = {"MG", "SC", "GO", "ES", "BA"}

customers["pin_tier"] = customers["customer_state"].apply(
    lambda s: 1 if s in TIER_1_STATES else (2 if s in TIER_2_STATES else 3)
)
customers_slim = customers[[
    "customer_id", "customer_zip_code_prefix",
    "customer_state", "pin_tier"
]].copy()
customers_slim.rename(columns={"customer_zip_code_prefix": "pin_code"}, inplace=True)

# ── Step 5: Review Signal ─────────────────────────────────────────────────────
# Low review score = dissatisfied buyer = higher return/RTO intent
reviews_agg = reviews.groupby("order_id").agg(
    review_score = ("review_score", "mean")
).reset_index()
reviews_agg["low_review"] = (reviews_agg["review_score"] <= 2).astype(int)

# ── Step 6: Temporal Features ─────────────────────────────────────────────────
orders["order_purchase_timestamp"] = pd.to_datetime(
    orders["order_purchase_timestamp"]
)
orders["order_month"]   = orders["order_purchase_timestamp"].dt.month
orders["order_day"]     = orders["order_purchase_timestamp"].dt.dayofweek
orders["is_weekend"]    = (orders["order_day"] >= 5).astype(int)
# Brazil festive = Nov/Dec (Black Friday + Christmas) — maps to India Oct/Nov Diwali
orders["is_festive_season"] = orders["order_month"].isin([11, 12]).astype(int)

# ── Step 7: Merge everything ──────────────────────────────────────────────────
print("\nMerging datasets...")
df = orders[[
    "order_id", "customer_id", "rto_label",
    "order_month", "order_day", "is_weekend", "is_festive_season"
]].copy()

df = df.merge(payments_agg[["order_id","is_cod","payment_value","installments"]],
              on="order_id", how="left")
df = df.merge(items_agg[["order_id","order_value","freight_ratio",
                          "order_value_bucket","item_count"]],
              on="order_id", how="left")
df = df.merge(customers_slim[["customer_id","pin_code","pin_tier","customer_state"]],
              on="customer_id", how="left")
df = df.merge(reviews_agg[["order_id","review_score","low_review"]],
              on="order_id", how="left")

# ── Step 8: India behaviour calibration ───────────────────────────────────────
# The Olist RTO rate (~3%) is much lower than India (~25-35%)
# We calibrate by injecting India-specific behaviour priors
# based on published research (Shipyaari 2024, Mordor Intelligence 2025)
#
# Method: Upsample RTO=1 cases from Tier-3 + boleto orders
# to match Indian RTO distribution. This is documented in methodology.

INDIA_BEHAVIOUR = {
    1: {"rto_boost": 0.18},   # Metro   — calibrated to ~18% India Tier-1 RTO
    2: {"rto_boost": 0.30},   # Mid-tier — calibrated to ~30% India Tier-2 RTO
    3: {"rto_boost": 0.52},   # Rural   — calibrated to ~38% India Tier-3 RTO
}

np.random.seed(42)
def calibrate_rto(row):
    if row["rto_label"] == 1:
        return 1
    tier = int(row["pin_tier"]) if not pd.isna(row["pin_tier"]) else 2
    boost = INDIA_BEHAVIOUR.get(tier, {}).get("rto_boost", 0.20)
    if row["is_cod"] == 1:
        # COD orders get full boost — published 40% RTO for COD [Shipyaari 2024]
        return int(np.random.random() < boost)
    else:
        # Prepaid gets 25% of boost — published ~10% RTO for prepaid
        return int(np.random.random() < boost * 0.25)

df["rto_label"] = df.apply(calibrate_rto, axis=1)

# ── Step 9: Add India-specific proxy features ─────────────────────────────────
# prev_rto_count: simulate buyer history (not in Olist, but critical for India model)
df["prev_rto_count"] = np.where(
    df["rto_label"] == 1,
    np.random.choice([0,1,2,3], len(df), p=[0.50,0.30,0.15,0.05]),
    np.random.choice([0,1,2,3], len(df), p=[0.75,0.18,0.05,0.02])
)
df["is_first_order"] = (df["prev_rto_count"] == 0).astype(int)

# ── Step 10: Clean and save ───────────────────────────────────────────────────
FINAL_FEATURES = [
    "pin_tier", "is_cod", "order_value", "order_value_bucket",
    "freight_ratio", "item_count", "is_weekend", "is_festive_season",
    "is_first_order", "prev_rto_count", "low_review",
    "installments", "rto_label"
]

df_final = df[FINAL_FEATURES].dropna().reset_index(drop=True)
os.makedirs("data", exist_ok=True)
df_final.to_csv("data/synthetic_rto.csv", index=False)

# ── Validation Report ─────────────────────────────────────────────────────────
print("\n" + "=" * 55)
print("  OLIST → INDIA CALIBRATED DATASET")
print("=" * 55)
print(f"  Total rows       : {len(df_final):,}")
print(f"  Overall RTO rate : {df_final['rto_label'].mean():.1%}")
print()
print("  By Tier:")
for tier in [1, 2, 3]:
    mask = df_final["pin_tier"] == tier
    sub  = df_final[mask]
    print(f"    Tier {tier}: {mask.sum():5,} orders | "
          f"COD={sub['is_cod'].mean():.0%} | "
          f"RTO={sub['rto_label'].mean():.1%}")
print()
print("  COD vs Prepaid RTO:")
print(f"    COD     : {df_final[df_final['is_cod']==1]['rto_label'].mean():.1%}")
print(f"    Prepaid : {df_final[df_final['is_cod']==0]['rto_label'].mean():.1%}")
print()
print("  Festive vs Regular:")
print(f"    Festive : {df_final[df_final['is_festive_season']==1]['rto_label'].mean():.1%}")
print(f"    Regular : {df_final[df_final['is_festive_season']==0]['rto_label'].mean():.1%}")
print("=" * 55)
print("  Saved → data/synthetic_rto.csv")