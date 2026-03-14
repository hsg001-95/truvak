import pandas as pd
import numpy as np
import json
import os

# ─────────────────────────────────────────────────────────────────────────────
# BUILD COMPLETE INDIA PIN CODE → TIER MAP
#
# Source 1: saravanakumargn/All-India-Pincode-Directory (GitHub)
# Source 2: RBI tier classification by population density
# Source 3: India Post circle/region classification
#
# Methodology:
# We use India Post's own administrative hierarchy to assign tiers:
# - Circle = state-level grouping
# - Region = sub-state grouping
# - Division = district-level grouping
# This mirrors RBI's population-based tier system closely enough
# for RTO risk prediction purposes.
# ─────────────────────────────────────────────────────────────────────────────

# ── Tier 1: Major metros — RBI Metropolitan (population > 1 million) ──────────
TIER_1_DISTRICTS = {
    # Delhi
    "central delhi", "new delhi", "north delhi", "south delhi",
    "east delhi", "west delhi", "north east delhi", "north west delhi",
    "south west delhi", "shahdara",
    # Mumbai
    "mumbai", "mumbai city", "mumbai suburban", "thane", "navi mumbai",
    # Bangalore
    "bangalore", "bangalore urban", "bangalore rural", "bengaluru urban",
    "bengaluru rural",
    # Chennai
    "chennai", "kancheepuram", "tiruvallur",
    # Hyderabad
    "hyderabad", "ranga reddy", "medchal",
    # Kolkata
    "kolkata", "howrah", "north 24 parganas", "south 24 parganas",
    # Pune
    "pune",
    # Ahmedabad
    "ahmedabad",
    # Other metros
    "surat", "jaipur", "lucknow", "kanpur", "nagpur", "indore",
    "bhopal", "visakhapatnam", "patna", "vadodara", "ludhiana",
    "agra", "nashik", "faridabad", "meerut", "rajkot", "varanasi",
    "srinagar", "aurangabad", "dhanbad", "amritsar", "allahabad",
    "prayagraj", "ranchi", "coimbatore", "jabalpur", "gwalior",
    "vijayawada", "jodhpur", "madurai", "raipur", "kota",
    "gurugram", "gurgaon", "noida", "gautam buddha nagar",
    "ghaziabad", "chandigarh", "mohali",
}

# ── Tier 2: Large cities — RBI Urban (100,000 – 999,999) ──────────────────────
TIER_2_DISTRICTS = {
    "salem", "tiruchirappalli", "tirupur", "erode", "vellore",
    "thiruvananthapuram", "kozhikode", "thrissur", "kochi", "ernakulam",
    "mangalore", "dakshina kannada", "mysore", "mysuru", "hubli", "dharwad",
    "belgaum", "belagavi", "shimoga", "shivamogga",
    "jalandhar", "amritsar", "patiala", "bathinda",
    "dehradun", "haridwar",
    "guwahati", "kamrup metropolitan",
    "bhubaneswar", "khordha", "cuttack",
    "jamshedpur", "east singhbhum",
    "jammu",
    "shimla",
    "panaji", "north goa", "south goa",
    "ajmer", "udaipur", "kota", "bikaner", "alwar", "bharatpur",
    "jabalpur", "gwalior", "ujjain", "ratlam",
    "gorakhpur", "bareilly", "aligarh", "moradabad", "saharanpur",
    "firozabad", "mathura",
    "warangal", "karimnagar", "nizamabad", "khammam",
    "guntur", "nellore", "kurnool", "rajahmundry", "tirupati",
    "kolhapur", "solapur", "amravati", "akola",
    "bilaspur", "durg",
    "bokaro", "deoghar",
    "muzaffarpur", "gaya", "bhagalpur", "darbhanga",
    "gorakhpur", "agra", "mathura",
}

# ── Everything else = Tier 3 (rural/remote) ───────────────────────────────────

def assign_tier(row) -> int:
    district = str(row.get("Districtname", "")).lower().strip()
    circle   = str(row.get("circlename",   "")).lower().strip()
    region   = str(row.get("regionname",   "")).lower().strip()

    # Check district name against tier lists
    if any(t1 in district for t1 in TIER_1_DISTRICTS):
        return 1
    if any(t2 in district for t2 in TIER_2_DISTRICTS):
        return 2

    # Use circle name as fallback signal
    # Major postal circles = Tier 1 dominant
    tier1_circles = {"delhi", "mumbai", "karnataka", "tamil nadu"}
    tier2_circles = {"rajasthan", "gujarat", "maharashtra", "telangana",
                     "andhra pradesh", "kerala", "punjab", "haryana"}
    if circle in tier1_circles:
        return 1
    if circle in tier2_circles:
        return 2

    return 3  # Default: Tier 3 (rural/remote)

def build_pin_tier_map(csv_path: str) -> dict:
    print(f"Loading PIN code database from {csv_path}...")
    
    # Try different encodings — India Post CSVs sometimes use latin-1
    for encoding in ["utf-8", "latin-1", "cp1252"]:
        try:
            df = pd.read_csv(csv_path, encoding=encoding, low_memory=False)
            print(f"  Loaded with {encoding} encoding")
            break
        except UnicodeDecodeError:
            continue

    print(f"  Total records: {len(df):,}")
    print(f"  Columns: {list(df.columns)}")

    # Normalize column names
    df.columns = [c.strip() for c in df.columns]

    # Check for pincode column
    pin_col = None
    for col in df.columns:
        if "pin" in col.lower() or "pincode" in col.lower() or "postal" in col.lower():
            pin_col = col
            break

    if not pin_col:
        print(f"ERROR: Could not find PIN code column. Columns: {list(df.columns)}")
        return {}

    print(f"  PIN code column: {pin_col}")

    # Assign tiers
    print("Assigning tiers...")
    df["pin_tier"] = df.apply(assign_tier, axis=1)

    # Build mapping: pincode → tier
    df[pin_col] = df[pin_col].astype(str).str.strip().str.zfill(6)
    pin_tier_map = dict(zip(df[pin_col], df["pin_tier"]))

    # Stats
    tier_counts = df["pin_tier"].value_counts().sort_index()
    print(f"\nTier distribution:")
    for tier, count in tier_counts.items():
        pct = count / len(df) * 100
        print(f"  Tier {tier}: {count:,} PIN codes ({pct:.1f}%)")

    return pin_tier_map

def save_pin_tier_map(pin_tier_map: dict, output_path: str):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(pin_tier_map, f)
    print(f"\nSaved {len(pin_tier_map):,} PIN code mappings → {output_path}")

if __name__ == "__main__":
    CSV_PATH    = "data/india_pincodes.csv"
    OUTPUT_PATH = "data/pin_tier_map.json"

    if not os.path.exists(CSV_PATH):
        print(f"ERROR: {CSV_PATH} not found.")
        print("Download from: https://github.com/saravanakumargn/All-India-Pincode-Directory")
        print("Save the CSV as: data/india_pincodes.csv")
        exit(1)

    pin_map = build_pin_tier_map(CSV_PATH)

    if pin_map:
        save_pin_tier_map(pin_map, OUTPUT_PATH)

        # Spot check
        test_pins = {
            "110001": "Delhi (expect Tier 1)",
            "400001": "Mumbai (expect Tier 1)",
            "226001": "Lucknow (expect Tier 2)",
            "828001": "Dhanbad (expect Tier 3)",
            "845001": "West Champaran (expect Tier 3)",
            "560001": "Bangalore (expect Tier 1)",
        }
        print("\nSpot check:")
        for pin, label in test_pins.items():
            tier = pin_map.get(pin, "NOT FOUND")
            print(f"  {pin} ({label}): Tier {tier}")
