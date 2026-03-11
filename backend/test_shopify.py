import os
from pathlib import Path

import requests
from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[1] / ".env")

store_url = os.getenv("SHOPIFY_STORE_URL")
access_token = os.getenv("SHOPIFY_ACCESS_TOKEN")
api_version = os.getenv("SHOPIFY_API_VERSION", "2024-01")

if not store_url or not access_token:
    raise SystemExit("Missing SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN in .env")

response = requests.get(
    f"https://{store_url}/admin/api/{api_version}/orders.json",
    params={"limit": 5, "status": "any"},
    headers={"X-Shopify-Access-Token": access_token},
    timeout=20,
)

print(f"Status: {response.status_code}")
print(f"Orders: {response.json()}")
