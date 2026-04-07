# backend/reset_db.py
import sys, os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from backend.db import get_connection

conn = get_connection()
cursor = conn.cursor()
cursor.execute("DELETE FROM trust_scores")
cursor.execute("DELETE FROM orders")
cursor.execute("DELETE FROM outcomes")
conn.commit()
cursor.close()
conn.close()
print("Database cleared. All scored orders deleted.")