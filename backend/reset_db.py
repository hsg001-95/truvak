# backend/reset_db.py
import sys, os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from backend.db import get_connection

conn = get_connection()
conn.execute("DELETE FROM trust_scores")
conn.execute("DELETE FROM orders")
conn.execute("DELETE FROM outcomes")
conn.commit()
conn.close()
print("Database cleared. All scored orders deleted.")