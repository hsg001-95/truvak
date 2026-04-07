import os

from backend.db_adapter import get_connection as adapter_get_connection
from backend.db_adapter import is_postgres

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'trust.db')

def get_connection():
    return adapter_get_connection()

def init_db():
    if is_postgres():
        # PostgreSQL schema is managed via migrations / Supabase SQL editor.
        print("PostgreSQL detected; skipping SQLite init_db schema bootstrap.")
        return

    import sqlite3

    conn = get_connection()
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS merchant_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            merchant_id TEXT NOT NULL,
            rule_name TEXT NOT NULL,
            condition_field TEXT NOT NULL,
            condition_operator TEXT NOT NULL,
            condition_value REAL NOT NULL,
            action TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS trust_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT NOT NULL,
            merchant_id TEXT NOT NULL,
            hashed_buyer_id TEXT NOT NULL,
            score REAL NOT NULL,
            risk_level TEXT NOT NULL,
            factors TEXT NOT NULL,
            recommended_action TEXT NOT NULL,
            is_cod INTEGER NOT NULL,
            order_value REAL NOT NULL,
            pin_code TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS outcomes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT NOT NULL,
            merchant_id TEXT NOT NULL,
            hashed_buyer_id TEXT NOT NULL,
            result TEXT NOT NULL,
            logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT UNIQUE NOT NULL,
            merchant_id TEXT NOT NULL,
            hashed_buyer_id TEXT NOT NULL,
            order_value REAL NOT NULL,
            is_cod INTEGER NOT NULL,
            pin_code TEXT NOT NULL,
            order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS review_analyses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            merchant_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            analysis_timestamp TEXT NOT NULL,
            total_reviews INTEGER NOT NULL,
            fake_count INTEGER NOT NULL,
            authenticity_score REAL NOT NULL,
            fake_review_percentage REAL NOT NULL,
            burst_detected INTEGER NOT NULL,
            template_detected INTEGER NOT NULL,
            ring_detected INTEGER NOT NULL,
            overall_verdict TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS review_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            merchant_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            review_text_hash TEXT NOT NULL,
            merchant_verdict TEXT NOT NULL,
            submitted_at TEXT NOT NULL
        );
    """)

    conn.commit()
    conn.close()
    print("Database initialised successfully.")

if __name__ == "__main__":
    init_db()

from backend.customer_schema import init_customer_db
