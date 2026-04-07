import logging
import os
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, Iterable
from urllib.parse import unquote, urlparse

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("truvak.db")

_DEFAULT_SQLITE_PATH = Path(__file__).resolve().parents[1] / "data" / "trust.db"
_DATABASE_URL = (os.getenv("DATABASE_URL") or "sqlite:///data/trust.db").strip()
_POOL_MIN = int(os.getenv("DB_POOL_MIN", "2"))
_POOL_MAX = int(os.getenv("DB_POOL_MAX", "10"))

_pool_lock = threading.Lock()
_pool: Any = None


def _url_scheme() -> str:
    parsed = urlparse(_DATABASE_URL)
    return (parsed.scheme or "").lower()


def is_postgres() -> bool:
    return _url_scheme() in {"postgresql", "postgres"}


def is_sqlite() -> bool:
    scheme = _url_scheme()
    return scheme in {"sqlite", ""}


def _sqlite_file_path() -> str:
    parsed = urlparse(_DATABASE_URL)

    if parsed.scheme == "sqlite":
        raw_path = unquote(parsed.path or "")
        if os.name == "nt" and raw_path.startswith("/") and len(raw_path) > 2 and raw_path[2] == ":":
            raw_path = raw_path[1:]

        if raw_path:
            path = Path(raw_path)
            if not path.is_absolute():
                path = Path(__file__).resolve().parents[1] / raw_path.lstrip("/")
            path.parent.mkdir(parents=True, exist_ok=True)
            return str(path)

    _DEFAULT_SQLITE_PATH.parent.mkdir(parents=True, exist_ok=True)
    return str(_DEFAULT_SQLITE_PATH)


def _import_psycopg2():
    try:
        import psycopg2  # type: ignore
        import psycopg2.extras  # type: ignore
        import psycopg2.pool  # type: ignore
        return psycopg2
    except Exception as exc:
        logger.error("psycopg2 is required for PostgreSQL DATABASE_URL")
        raise RuntimeError("psycopg2 is not installed for PostgreSQL mode") from exc


def get_pool():
    if not is_postgres():
        return None

    global _pool
    if _pool is not None:
        return _pool

    with _pool_lock:
        if _pool is not None:
            return _pool

        psycopg2 = _import_psycopg2()
        try:
            _pool = psycopg2.pool.ThreadedConnectionPool(
                minconn=max(1, _POOL_MIN),
                maxconn=max(max(1, _POOL_MIN), _POOL_MAX),
                dsn=_DATABASE_URL,
                cursor_factory=psycopg2.extras.RealDictCursor,
            )
            logger.info("Initialized PostgreSQL connection pool")
        except Exception as exc:
            logger.error("Failed to initialize PostgreSQL pool: %s", exc)
            raise

    return _pool


def close_pool() -> None:
    global _pool
    with _pool_lock:
        if _pool is not None:
            try:
                _pool.closeall()
            finally:
                _pool = None


def get_connection():
    if is_postgres():
        _import_psycopg2()
        pg_pool = get_pool()
        if pg_pool is None:
            raise RuntimeError("PostgreSQL pool unavailable")

        conn = pg_pool.getconn()
        conn.autocommit = False

        # Tag pooled connections so close_connection can safely return them.
        setattr(conn, "_truvak_from_pool", True)
        return conn

    sqlite_path = _sqlite_file_path()
    conn = sqlite3.connect(sqlite_path)
    conn.row_factory = sqlite3.Row
    return conn


def close_connection(conn) -> None:
    if conn is None:
        return

    if is_postgres() and getattr(conn, "_truvak_from_pool", False):
        pool_instance = get_pool()
        if pool_instance is not None:
            pool_instance.putconn(conn)
        return

    conn.close()


def placeholder() -> str:
    return "%s" if is_postgres() else "?"


def adapt_query(query: str) -> str:
    if is_postgres():
        return query.replace("?", "%s")
    return query


def executemany_query(cursor, query: str, params: Iterable[Iterable[Any]]) -> None:
    cursor.executemany(adapt_query(query), params)


def health_probe() -> Dict[str, Any]:
    start = time.time()
    conn = None

    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        cursor.close()

        return {
            "db_type": "postgresql" if is_postgres() else "sqlite",
            "connected": True,
            "latency_ms": round((time.time() - start) * 1000, 2),
            "using_pool": bool(is_postgres()),
        }
    except Exception as exc:
        logger.error("Health probe failed: %s", exc)
        return {
            "db_type": "postgresql" if is_postgres() else "sqlite",
            "connected": False,
            "latency_ms": None,
            "error": str(exc),
            "using_pool": bool(is_postgres()),
        }
    finally:
        close_connection(conn)


@contextmanager
def get_db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception as exc:
        conn.rollback()
        logger.error("DB transaction failed: %s", exc)
        raise
    finally:
        close_connection(conn)
