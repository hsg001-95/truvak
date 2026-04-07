"""
Export SQLite tables to CSV for pre-migration backup checks.

Usage:
    python scripts/export_sqlite.py
"""

import csv
import os
import sqlite3
from pathlib import Path

SQLITE_PATH = Path("data") / "trust.db"
EXPORT_DIR = Path("data") / "sqlite_exports"

TABLES = [
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


def table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchone()
    return row is not None


def export_table(conn: sqlite3.Connection, table: str) -> None:
    rows = conn.execute(f"SELECT * FROM {table}").fetchall()
    output = EXPORT_DIR / f"{table}.csv"

    if not rows:
        output.write_text("", encoding="utf-8")
        print(f"{table}: exported 0 rows")
        return

    headers = rows[0].keys()
    with output.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        for row in rows:
            writer.writerow([row[h] for h in headers])

    print(f"{table}: exported {len(rows)} rows")


def main() -> None:
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    try:
        for table in TABLES:
            if not table_exists(conn, table):
                print(f"{table}: not found, skipped")
                continue
            export_table(conn, table)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
