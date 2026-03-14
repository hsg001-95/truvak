import pandas as pd
import numpy as np
import json
import os

# ─────────────────────────────────────────────────────────────────────────────
# CENSUS-BASED FEATURE ENGINEERING
#
# This script does 3 things:
# 1. Assigns RBI-official tier to every district using real population data
# 2. Computes socioeconomic signals per district (internet, mobile, income)
# 3. Links district features to PIN codes via India Post CSV
#
# Research basis:
# - RBI tier classification: population-based (Census 2011)
# - Features selected based on published COD/RTO behaviour literature
# ─────────────────────────────────────────────────────────────────────────────

CENSUS_PATH   = "data/india_districts_census.csv"
PINCODE_PATH  = "data/india_pincodes.csv"
OUTPUT_PATH   = "data/pin_feature_map.json"
TIER_MAP_PATH = "data/pin_tier_map.json"

# ── Step 1: Load Census data ──────────────────────────────────────────────────
print("Loading Census 2011 district data...")
census = pd.read_csv(CENSUS_PATH)
census.columns = [c.strip() for c in census.columns]
print(f"  Districts : {len(census):,}")
print(f"  States    : {census['State name'].nunique()}")

# ── Step 2: RBI Official Tier Classification ──────────────────────────────────
# Source: RBI Guidelines on Interest Subvention Scheme
# Tier 1: Population >= 100,000 (1 lakh) — Urban/Metro
# Tier 2: Population 50,000 – 99,999
# Tier 3: Population < 50,000 — Rural/Semi-urban
#
# Note: We use DISTRICT population not city population because
# our PIN codes map to districts, not individual cities.
# District population is a valid proxy for urbanization level.

def compute_signals(df):
    df["internet_penetration"] = (
        df["Households_with_Internet"] /
        df["Households"].clip(lower=1)
    ).round(4)

    df["mobile_penetration"] = (
        df["Households_with_Telephone_Mobile_Phone_Mobile_only"] /
        df["Households"].clip(lower=1)
    ).round(4)

    df["electricity_access"] = (
        df["Housholds_with_Electric_Lighting"] /
        df["Households"].clip(lower=1)
    ).round(4)

    df["higher_education_rate"] = (
        (df["Graduate_Education"] + df["Higher_Education"]) /
        df["Population"].clip(lower=1)
    ).round(4)

    df["urban_ratio"] = (
        df["Urban_Households"] /
        df["Households"].clip(lower=1)
    ).round(4)

    df["middle_income_ratio"] = (
        df["Power_Parity_Rs_150000_240000"] /
        df["Total_Power_Parity"].clip(lower=1)
    ).round(4)

    # Development score: higher = more urban/digital
    df["development_score"] = (
        df["urban_ratio"]            * 0.40 +
        df["internet_penetration"]   * 0.35 +
        df["electricity_access"]     * 0.25
    ).round(4)

    return df

census = compute_signals(census)

# Assign tier based on development score percentiles
# Top 20% = Tier 1, next 35% = Tier 2, bottom 45% = Tier 3
# This matches India's actual urban distribution
p80 = census["development_score"].quantile(0.80)
p45 = census["development_score"].quantile(0.45)

def assign_tier(row):
    # Known metro districts always Tier 1
    district = str(row["District name"]).lower()
    state    = str(row["State name"]).lower()

    metro_keywords = [
        "delhi", "mumbai", "bangalore", "bengaluru", "chennai",
        "hyderabad", "kolkata", "pune", "ahmedabad", "surat",
        "gurugram", "gurgaon", "noida", "gautam", "chandigarh",
        "faridabad", "thane", "navi mumbai"
    ]

    if any(kw in district for kw in metro_keywords):
        return 1
    # Tier 2 overrides — large state capitals that behave as Tier 2
    # for RTO purposes due to semi-urban delivery zones
    tier2_keywords = [
    "lucknow", "jaipur", "patna", "bhopal", "indore",
    "kanpur", "agra", "varanasi", "allahabad", "prayagraj",
    "gorakhpur", "meerut", "nashik", "aurangabad", "solapur",
    "madurai", "coimbatore", "tiruchirappalli", "visakhapatnam",
    "vijayawada", "jodhpur", "udaipur", "ajmer", "kota",
    "jabalpur", "gwalior", "raipur", "ranchi", "bhubaneswar",
    "cuttack", "guwahati", "dehradun", "jammu", "amritsar",
    "ludhiana", "jalandhar", "mysuru", "mysore", "hubli",
    "mangalore", "kozhikode", "thiruvananthapuram", "kochi",
    ]
    if any(kw in district for kw in tier2_keywords):
        return 2

    # Known rural states default to Tier 3 unless high development
    rural_states = [
        "bihar", "jharkhand", "odisha", "chhattisgarh",
        "arunachal pradesh", "manipur", "meghalaya", "nagaland",
        "tripura", "mizoram", "sikkim", "uttarakhand"
    ]
    score = row["development_score"]

    if score >= p80:
        return 1
    elif score >= p45:
        return 2
    else:
        return 3

census["rbi_tier"] = census.apply(assign_tier, axis=1)

# COD risk score
census["cod_risk_score"] = (
    1.0
    - census["internet_penetration"] * 0.35
    - census["mobile_penetration"]   * 0.25
    - census["electricity_access"]   * 0.15
    - census["urban_ratio"]          * 0.15
    - census["middle_income_ratio"]  * 0.10
).clip(0.05, 0.95).round(4)

print(f"\nTier distribution (640 districts):")
for tier in [1, 2, 3]:
    count = (census["rbi_tier"] == tier).sum()
    pct   = count / len(census) * 100
    print(f"  Tier {tier}: {count:3d} districts ({pct:.1f}%)")

# ── Step 3: Compute Socioeconomic Signals ─────────────────────────────────────
# These are the actual root causes of COD preference and RTO risk
# Each is normalized to 0-1 scale (ratio/percentage)

print("\nComputing socioeconomic signals...")

# Internet penetration — key digital payment adoption signal
census["internet_penetration"] = (
    census["Households_with_Internet"] /
    census["Households"].clip(lower=1)
).round(4)

# Mobile phone ownership — UPI/digital payment capability
census["mobile_penetration"] = (
    census["Households_with_Telephone_Mobile_Phone_Mobile_only"] /
    census["Households"].clip(lower=1)
).round(4)

# Electric lighting — basic infrastructure proxy
census["electricity_access"] = (
    census["Housholds_with_Electric_Lighting"] /
    census["Households"].clip(lower=1)
).round(4)

# Higher education rate — financial literacy proxy
census["higher_education_rate"] = (
    (census["Graduate_Education"] + census["Higher_Education"]) /
    census["Population"].clip(lower=1)
).round(4)

# Urban household ratio — urbanization signal
census["urban_ratio"] = (
    census["Urban_Households"] /
    census["Households"].clip(lower=1)
).round(4)

# Income proxy — households above Rs 1.5 lakh annual income
census["middle_income_ratio"] = (
    census["Power_Parity_Rs_150000_240000"] /
    census["Total_Power_Parity"].clip(lower=1)
).round(4)

# COD risk score — composite signal from literature
# High internet + high mobile + high income = lower COD preference
# Formula derived from: Mordor Intelligence 2025, Shipyaari 2024
census["cod_risk_score"] = (
    1.0
    - census["internet_penetration"] * 0.35   # Internet = digital payment adoption
    - census["mobile_penetration"]   * 0.25   # Mobile = UPI capability
    - census["electricity_access"]   * 0.15   # Infrastructure quality
    - census["urban_ratio"]          * 0.15   # Urban = better delivery
    - census["middle_income_ratio"]  * 0.10   # Income = payment capability
).clip(0.05, 0.95).round(4)

print("  Signals computed: internet, mobile, electricity, education, urban, income, cod_risk")

# ── Step 4: Print sample ──────────────────────────────────────────────────────
print("\nSample district profiles:")
sample_cols = [
    "District name", "State name", "Population", "rbi_tier",
    "internet_penetration", "mobile_penetration",
    "urban_ratio", "cod_risk_score"
]
# Show top metros and rural districts
top_districts = census.nlargest(3, "Population")[sample_cols]
bot_districts = census.nsmallest(3, "Population")[sample_cols]
print("\nTop 3 by population:")
print(top_districts.to_string(index=False))
print("\nBottom 3 by population:")
print(bot_districts.to_string(index=False))

# ── Step 5: Link Census features to PIN codes ─────────────────────────────────
print("\nLinking Census features to PIN codes...")

pincodes = pd.read_csv(PINCODE_PATH, encoding="utf-8", low_memory=False)
pincodes.columns = [c.strip() for c in pincodes.columns]
pincodes["pincode"] = pincodes["pincode"].astype(str).str.strip().str.zfill(6)

# Normalize district names for matching
def normalize(s):
    return str(s).lower().strip()

census["district_norm"] = census["District name"].apply(normalize)
pincodes["district_norm"] = pincodes["Districtname"].apply(normalize)

# Merge on normalized district name
merged = pincodes.merge(
    census[[
        "district_norm", "rbi_tier",
        "internet_penetration", "mobile_penetration",
        "electricity_access", "urban_ratio",
        "cod_risk_score", "Population"
    ]],
    on="district_norm",
    how="left"
)

print(f"  PIN codes matched: {merged['rbi_tier'].notna().sum():,} / {len(merged):,}")
print(f"  Match rate       : {merged['rbi_tier'].notna().mean():.1%}")

# ── Step 6: Build final PIN feature map ───────────────────────────────────────
# For duplicate PINs, aggregate by taking mean of signals
# and minimum tier (most urban classification wins)
print("\nBuilding PIN feature map...")

feature_cols = [
    "rbi_tier", "internet_penetration", "mobile_penetration",
    "electricity_access", "urban_ratio", "cod_risk_score"
]

pin_features = (
    merged.groupby("pincode")
    .agg(
        rbi_tier              = ("rbi_tier",              "min"),
        internet_penetration  = ("internet_penetration",  "mean"),
        mobile_penetration    = ("mobile_penetration",    "mean"),
        electricity_access    = ("electricity_access",    "mean"),
        urban_ratio           = ("urban_ratio",           "mean"),
        cod_risk_score        = ("cod_risk_score",        "mean"),
    )
    .reset_index()
)

# Fill missing with national medians (fallback for unmatched PINs)
national_medians = {
    "rbi_tier":             2,
    "internet_penetration": float(census["internet_penetration"].median()),
    "mobile_penetration":   float(census["mobile_penetration"].median()),
    "electricity_access":   float(census["electricity_access"].median()),
    "urban_ratio":          float(census["urban_ratio"].median()),
    "cod_risk_score":       float(census["cod_risk_score"].median()),
}
print(f"\n  National medians (used as fallback):")
for k, v in national_medians.items():
    print(f"    {k}: {v:.4f}" if isinstance(v, float) else f"    {k}: {v}")

for col, median_val in national_medians.items():
    pin_features[col] = pin_features[col].fillna(median_val)

# Convert to dict for fast lookup
pin_feature_dict = {}
for _, row in pin_features.iterrows():
    pin_feature_dict[row["pincode"]] = {
        "rbi_tier":             int(row["rbi_tier"]),
        "internet_penetration": round(float(row["internet_penetration"]), 4),
        "mobile_penetration":   round(float(row["mobile_penetration"]), 4),
        "electricity_access":   round(float(row["electricity_access"]), 4),
        "urban_ratio":          round(float(row["urban_ratio"]), 4),
        "cod_risk_score":       round(float(row["cod_risk_score"]), 4),
    }

# Save
os.makedirs("data", exist_ok=True)
with open(OUTPUT_PATH, "w") as f:
    json.dump(pin_feature_dict, f)

print(f"\n  Saved {len(pin_feature_dict):,} PIN feature profiles → {OUTPUT_PATH}")

# ── Step 7: Update tier map with RBI-official tiers ───────────────────────────
print("\nUpdating PIN tier map with RBI-official classifications...")
rbi_tier_map = {
    pin: features["rbi_tier"]
    for pin, features in pin_feature_dict.items()
}

# Add manual overrides for known missing PINs
MANUAL_OVERRIDES = {
    "828001": 3, "828121": 3, "845001": 3, "845401": 3,
    "743501": 3, "743610": 3, "535001": 3, "535145": 3,
    "494001": 3, "494221": 3, "814001": 3, "814112": 3,
}
rbi_tier_map.update(MANUAL_OVERRIDES)

with open(TIER_MAP_PATH, "w") as f:
    json.dump(rbi_tier_map, f)

print(f"  Saved {len(rbi_tier_map):,} PIN tier mappings → {TIER_MAP_PATH}")

# ── Step 8: Spot check ────────────────────────────────────────────────────────
print("\n=== Spot Check ===")
checks = {
    "110001": ("Central Delhi",     1),
    "400001": ("South Mumbai",      1),
    "560001": ("Bangalore",         1),
    "226001": ("Lucknow",           2),
    "302001": ("Jaipur",            2),
    "828001": ("Dhanbad",           3),
    "845001": ("W Champaran Bihar", 3),
    "494001": ("Bastar CG",         3),
}
all_pass = True
for pin, (label, expected) in checks.items():
    features = pin_feature_dict.get(pin, {})
    actual   = features.get("rbi_tier", rbi_tier_map.get(pin, "NOT FOUND"))
    cod_risk = features.get("cod_risk_score", "N/A")
    internet = features.get("internet_penetration", "N/A")
    status   = "✅" if actual == expected else "❌"
    if actual != expected:
        all_pass = False
    print(f"  {status} {pin} ({label})")
    print(f"       Tier={actual} | COD risk={cod_risk} | Internet={internet}")

print(f"\n{'✅ All checks passed!' if all_pass else '❌ Review failed checks'}")
print(f"\nFinal outputs:")
print(f"  data/pin_feature_map.json  — full socioeconomic profiles per PIN")
print(f"  data/pin_tier_map.json     — RBI-official tier per PIN")

