"""
Validate Supabase/PostgreSQL connectivity and expected tables.

Usage:
    python scripts/test_supabase_connection.py
"""

import os
import importlib
from pathlib import Path
from typing import Any

from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[1] / ".env")

EXPECTED_TABLES = [
    "orders",
    "trust_scores",
    "outcomes",
    "merchant_rules",
    "review_analyses",
    "review_feedback",
    "customer_accounts",
    "product_prices",
    "product_price_summary",
    "price_comparison_cache",
    "customer_watchlist",
    "customer_orders",
    "dark_pattern_log",
]


def _load_psycopg2() -> Any:
    try:
        psycopg2_mod = importlib.import_module("psycopg2")
        importlib.import_module("psycopg2.extras")
        return psycopg2_mod
    except Exception as exc:
        raise RuntimeError("psycopg2 is required. Install psycopg2-binary first.") from exc


def main() -> None:
    psycopg2_mod = _load_psycopg2()
    database_url = (os.getenv("DATABASE_URL") or "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set")
    lowered = database_url.lower()
    if not (lowered.startswith("postgresql://") or lowered.startswith("postgres://")):
        raise RuntimeError("DATABASE_URL must point to PostgreSQL for this test")

    conn = psycopg2_mod.connect(database_url)
    cur = conn.cursor(cursor_factory=psycopg2_mod.extras.RealDictCursor)

    try:
        cur.execute(
            """
            SELECT tablename
            FROM pg_tables
            WHERE schemaname = 'public'
            """
        )
        existing = {row["tablename"] for row in cur.fetchall()}

        print("Table verification:")
        all_ok = True
        for table in EXPECTED_TABLES:
            ok = table in existing
            status = "OK" if ok else "MISSING"
            if not ok:
                all_ok = False
            print(f"  {table}: {status}")

        print("\nResult:", "ALL OK" if all_ok else "ISSUES FOUND")
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
