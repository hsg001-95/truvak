# backend/clear_demo_orders.py
import sys, os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from backend.db import get_connection

conn = get_connection()

# Keep only Shopify orders (numeric IDs) — delete demo orders (ORD-D prefix)
deleted = conn.execute("""
    DELETE FROM trust_scores
    WHERE order_id LIKE 'ORD-D%'
    OR order_id LIKE 'ORD-TEST%'
""")
conn.execute("""
    DELETE FROM orders
    WHERE order_id LIKE 'ORD-D%'
    OR order_id LIKE 'ORD-TEST%'
""")
conn.commit()
conn.close()
print(f"Cleared demo orders. Database now contains only real orders.")
