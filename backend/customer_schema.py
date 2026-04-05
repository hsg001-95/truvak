import sqlite3
import os

# Database path to trust.db in the data folder
DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'data', 'trust.db'))

def get_customer_db_connection():
    """Returns a sqlite3 connection to trust.db with row_factory set to sqlite3.Row."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_customer_db(conn):
    """Executes all CREATE TABLE and CREATE INDEX statements for the customer side."""
    cursor = conn.cursor()

    # TABLE 1: customer_accounts
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS customer_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id_hash TEXT UNIQUE NOT NULL,
        email_hash TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        pin_code TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_active TIMESTAMP
    )
    """)

    # TABLE 2: product_prices
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS product_prices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        price REAL NOT NULL,
        source TEXT NOT NULL DEFAULT 'own',
        data_quality_score REAL DEFAULT 1.0,
        validation_source TEXT,
        observed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # TABLE 3: product_price_summary
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS product_price_summary (
        product_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        price_15d_low REAL,
        price_15d_high REAL,
        price_15d_avg REAL,
        current_price REAL,
        data_points_count INTEGER DEFAULT 0,
        trend_direction TEXT,
        deal_indicator TEXT,
        confidence_label TEXT,
        last_updated TIMESTAMP,
        PRIMARY KEY (product_id, platform)
    )
    """)

    # TABLE 4: price_comparison_cache
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS price_comparison_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_product_id TEXT NOT NULL,
        compared_platform TEXT NOT NULL,
        matched_price REAL,
        confidence_level TEXT,
        match_method TEXT,
        cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP
    )
    """)

    # TABLE 5: customer_watchlist
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS customer_watchlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id_hash TEXT NOT NULL,
        product_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        product_name TEXT NOT NULL,
        product_url TEXT NOT NULL,
        price_at_save REAL NOT NULL,
        current_price REAL,
        alert_threshold_pct REAL DEFAULT 5.0,
        last_checked TIMESTAMP,
        alert_sent BOOLEAN DEFAULT FALSE,
        alert_sent_at TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # TABLE 6: customer_orders
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS customer_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id_hash TEXT NOT NULL,
        order_id_hash TEXT UNIQUE NOT NULL,
        platform TEXT NOT NULL,
        product_category TEXT,
        order_value REAL NOT NULL,
        order_date TEXT NOT NULL,
        order_status TEXT,
        is_cod BOOLEAN DEFAULT FALSE,
        order_hour INTEGER,
        scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # TABLE 7: dark_pattern_log
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS dark_pattern_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id_hash TEXT NOT NULL,
        product_id TEXT,
        platform TEXT NOT NULL,
        pattern_type TEXT NOT NULL,
        pattern_detail TEXT,
        detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_product_prices_product_platform ON product_prices(product_id, platform)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_product_prices_observed ON product_prices(observed_at)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_orders_customer ON customer_orders(customer_id_hash)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_orders_date ON customer_orders(order_date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_watchlist_customer ON customer_watchlist(customer_id_hash)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_watchlist_active ON customer_watchlist(customer_id_hash, is_active)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_price_cache_product ON price_comparison_cache(source_product_id, compared_platform)")

    conn.commit()

if __name__ == "__main__":
    connection = get_customer_db_connection()
    init_customer_db(connection)
    connection.close()
    print("Customer database tables and indexes initialized in trust.db.")
