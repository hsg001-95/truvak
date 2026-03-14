import pandas as pd
df = pd.read_csv("data/india_districts_census.csv")
print(f"Rows: {len(df)}")
print(f"States: {df['State name'].nunique()}")