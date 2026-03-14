import pandas as pd

df = pd.read_csv("data/india_pincodes.csv", low_memory=False)
df.columns = [c.strip() for c in df.columns]
df["pincode"] = df["pincode"].astype(str).str.strip().str.zfill(6)

# Check our missing PINs
test_pins = ["828001", "845001", "226001", "110001"]
for pin in test_pins:
    rows = df[df["pincode"] == pin]
    if len(rows) > 0:
        print(f"\n{pin} — found {len(rows)} rows:")
        print(rows[["pincode","Districtname","regionname","circlename","statename"]].to_string())
    else:
        print(f"\n{pin} — NOT IN CSV")

