"""
Truvak SQLite -> Supabase PostgreSQL migration script.

Usage:
    python scripts/migrate_to_supabase.py

This migrates merchant-side tables from data/trust.db into PostgreSQL.
"""

import os
import sqlite3
import importlib
import json
import ast
from typing import Any, Sequence

from dotenv import load_dotenv


load_dotenv()

SQLITE_PATH = os.path.join("data", "trust.db")
PG_URL = os.getenv("DATABASE_URL", "").strip()

TABLES: Sequence[str] = (
    "orders",
    "trust_scores",
    "outcomes",
    "merchant_rules",
    "review_analyses",
    "review_feedback",
)

COLUMN_ALIASES: dict[str, dict[str, str]] = {
    "outcomes": {
        "result": "outcome",
    },
}


def _load_psycopg2() -> Any:
    try:
        psycopg2_mod = importlib.import_module("psycopg2")
        importlib.import_module("psycopg2.extras")
        return psycopg2_mod
    except Exception as exc:
        raise RuntimeError("psycopg2 is required. Install psycopg2-binary first.") from exc


def ensure_postgres_url() -> None:
    if not PG_URL:
        raise RuntimeError("DATABASE_URL is not set")
    lowered = PG_URL.lower()
    if not (lowered.startswith("postgresql://") or lowered.startswith("postgres://")):
        raise RuntimeError("DATABASE_URL must point to PostgreSQL for this migration")


def table_exists_sqlite(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchone()
    return row is not None


def read_sqlite_rows(conn: sqlite3.Connection, table: str) -> list[sqlite3.Row]:
    return conn.execute(f"SELECT * FROM {table}").fetchall()


def get_postgres_columns(pg_cur, table: str) -> dict[str, str]:
    pg_cur.execute(
        """
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        """,
        (table,),
    )
    return {row[0]: row[1] for row in pg_cur.fetchall()}


def adapt_value_for_postgres(value: Any, pg_data_type: str) -> Any:
    if value is None:
        return None

    if pg_data_type == "boolean":
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        text = str(value).strip().lower()
        if text in {"1", "true", "t", "yes", "y"}:
            return True
        if text in {"0", "false", "f", "no", "n"}:
            return False

    if pg_data_type in {"json", "jsonb"}:
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False)
        text = str(value).strip()
        if not text:
            return "null"
        try:
            parsed = json.loads(text)
            return json.dumps(parsed, ensure_ascii=False)
        except Exception:
            try:
                parsed = ast.literal_eval(text)
                return json.dumps(parsed, ensure_ascii=False)
            except Exception:
                return json.dumps(text, ensure_ascii=False)

    return value


def migrate_table(
    sqlite_conn: sqlite3.Connection,
    pg_cur,
    pg_conn,
    table: str,
) -> None:
    if not table_exists_sqlite(sqlite_conn, table):
        print(f"{table}: missing in SQLite, skipping")
        return

    rows = read_sqlite_rows(sqlite_conn, table)
    if not rows:
        print(f"{table}: empty, skipping")
        return

    sqlite_cols = list(rows[0].keys())
    pg_cols = get_postgres_columns(pg_cur, table)
    alias_map = COLUMN_ALIASES.get(table, {})

    col_pairs: list[tuple[str, str]] = []
    for sqlite_col in sqlite_cols:
        target_col = alias_map.get(sqlite_col, sqlite_col)
        if target_col in pg_cols:
            col_pairs.append((sqlite_col, target_col))

    if not col_pairs:
        print(f"{table}: no matching columns between SQLite and PostgreSQL, skipping")
        return

    source_cols = [pair[0] for pair in col_pairs]
    target_cols = [pair[1] for pair in col_pairs]

    placeholders = ",".join(["%s"] * len(target_cols))
    col_names = ",".join(target_cols)

    insert_sql = f"""
        INSERT INTO {table} ({col_names})
        VALUES ({placeholders})
        ON CONFLICT DO NOTHING
    """

    data = [
        tuple(adapt_value_for_postgres(row[src_col], pg_cols[target_col]) for src_col, target_col in col_pairs)
        for row in rows
    ]
    psycopg2_mod = _load_psycopg2()
    psycopg2_mod.extras.execute_batch(pg_cur, insert_sql, data, page_size=500)
    pg_conn.commit()

    pg_cur.execute(f"SELECT COUNT(*) FROM {table}")
    count = int(pg_cur.fetchone()[0])
    print(f"{table}: migrated {len(rows)} rows, postgres now has {count}")


def migrate() -> None:
    ensure_postgres_url()
    psycopg2_mod = _load_psycopg2()

    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_conn.row_factory = sqlite3.Row

    pg_conn = psycopg2_mod.connect(PG_URL)
    pg_cur = pg_conn.cursor()

    try:
        for table in TABLES:
            migrate_table(sqlite_conn, pg_cur, pg_conn, table)
    finally:
        pg_cur.close()
        pg_conn.close()
        sqlite_conn.close()

    print("Migration complete.")


def validate() -> None:
    ensure_postgres_url()
    psycopg2_mod = _load_psycopg2()

    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    pg_conn = psycopg2_mod.connect(PG_URL)
    pg_cur = pg_conn.cursor()

    print("\nValidation:")
    try:
        for table in TABLES:
            if not table_exists_sqlite(sqlite_conn, table):
                print(f"{table}: missing in SQLite, skipped")
                continue

            sqlite_count = int(sqlite_conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
            pg_cur.execute(f"SELECT COUNT(*) FROM {table}")
            pg_count = int(pg_cur.fetchone()[0])
            mark = "OK" if sqlite_count == pg_count else "MISMATCH"
            print(f"{table}: SQLite={sqlite_count} Postgres={pg_count} [{mark}]")
    finally:
        pg_cur.close()
        pg_conn.close()
        sqlite_conn.close()


if __name__ == "__main__":
    migrate()
    validate()
