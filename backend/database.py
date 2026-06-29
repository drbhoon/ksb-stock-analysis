"""
database.py — SQLite-based persistence layer for multi-user Portfolio Analyser.

Tables:
  users       — one row per Google account (google_id, email, name, picture)
  portfolios  — one active portfolio snapshot per user (JSON blob)
  mf_watchlist — saved MF fund list per user

The DB file location is controlled by DB_PATH env var (default: ./data/app.db).
On Railway, set the Volume mount to /app/data so it survives redeploys.
"""
import os
import sqlite3
import json
import logging
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)

# ── DB file path ─────────────────────────────────────────────────────────────
_DATA_DIR = os.getenv("DB_DATA_DIR", os.path.join(os.path.dirname(__file__), "data"))
DB_PATH = os.path.join(_DATA_DIR, "app.db")


def _get_conn() -> sqlite3.Connection:
    os.makedirs(_DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")   # safe for concurrent reads
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    """Create all tables if they don't already exist. Called once on startup."""
    with _get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id          TEXT PRIMARY KEY,
                email       TEXT UNIQUE NOT NULL,
                name        TEXT,
                picture     TEXT,
                created_at  TEXT DEFAULT (datetime('now')),
                last_login  TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS portfolios (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                file_name   TEXT,
                data        TEXT NOT NULL,
                created_at  TEXT DEFAULT (datetime('now')),
                updated_at  TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS mf_watchlist (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                scheme_code INTEGER NOT NULL,
                scheme_name TEXT NOT NULL,
                category    TEXT,
                added_at    TEXT DEFAULT (datetime('now')),
                UNIQUE(user_id, scheme_code)
            );

            CREATE TABLE IF NOT EXISTS game_portfolios (
                id                     INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id                TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                season                 INTEGER NOT NULL DEFAULT 1,
                is_active              INTEGER NOT NULL DEFAULT 1,
                cash                   REAL NOT NULL DEFAULT 0.0,
                loan_principal         REAL NOT NULL DEFAULT 0.0,
                accrued_interest       REAL NOT NULL DEFAULT 0.0,
                starting_capital       REAL NOT NULL DEFAULT 0.0,
                last_interest_accrual  TEXT NOT NULL DEFAULT (datetime('now')),
                created_at             TEXT DEFAULT (datetime('now')),
                updated_at             TEXT DEFAULT (datetime('now')),
                UNIQUE(user_id, season)
            );

            CREATE TABLE IF NOT EXISTS game_holdings (
                id                 INTEGER PRIMARY KEY AUTOINCREMENT,
                portfolio_id       INTEGER NOT NULL REFERENCES game_portfolios(id) ON DELETE CASCADE,
                symbol             TEXT NOT NULL,
                company_name       TEXT NOT NULL,
                quantity           INTEGER NOT NULL,
                average_buy_price  REAL NOT NULL,
                created_at         TEXT DEFAULT (datetime('now')),
                UNIQUE(portfolio_id, symbol)
            );

            CREATE TABLE IF NOT EXISTS game_transactions (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                portfolio_id  INTEGER NOT NULL REFERENCES game_portfolios(id) ON DELETE CASCADE,
                type          TEXT NOT NULL,
                symbol        TEXT,
                quantity      INTEGER,
                price         REAL,
                fee           REAL,
                amount        REAL NOT NULL,
                timestamp     TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS game_daily_snapshots (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                portfolio_id      INTEGER NOT NULL REFERENCES game_portfolios(id) ON DELETE CASCADE,
                date              TEXT NOT NULL,
                cash              REAL NOT NULL,
                holdings_value    REAL NOT NULL,
                loan_principal    REAL NOT NULL,
                accrued_interest  REAL NOT NULL,
                net_worth         REAL NOT NULL,
                timestamp         TEXT DEFAULT (datetime('now')),
                UNIQUE(portfolio_id, date)
            );

            CREATE TABLE IF NOT EXISTS game_pending_orders (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                portfolio_id  INTEGER NOT NULL REFERENCES game_portfolios(id) ON DELETE CASCADE,
                type          TEXT NOT NULL,
                symbol        TEXT NOT NULL,
                company_name  TEXT NOT NULL,
                quantity      INTEGER NOT NULL,
                created_at    TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS game_reset_requests (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                portfolio_id   INTEGER REFERENCES game_portfolios(id) ON DELETE SET NULL,
                season         INTEGER NOT NULL,
                status         TEXT NOT NULL DEFAULT 'PENDING',
                requested_at   TEXT DEFAULT (datetime('now')),
                reviewed_at    TEXT,
                reviewed_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
                admin_note     TEXT
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_game_reset_requests_one_pending
            ON game_reset_requests(user_id)
            WHERE status = 'PENDING';
        """)
    logger.info(f"Database initialised at {DB_PATH}")

    # Migration: Add starting_capital to game_portfolios if not present
    with _get_conn() as conn:
        cursor = conn.execute("PRAGMA table_info(game_portfolios)")
        columns = [row["name"] for row in cursor.fetchall()]
        if "starting_capital" not in columns:
            logger.info("Migrating database: adding 'starting_capital' column to game_portfolios")
            conn.execute("ALTER TABLE game_portfolios ADD COLUMN starting_capital REAL NOT NULL DEFAULT 0.0")
            
            # 1. Closed seasons: all existing closed seasons started with 50,000.0
            conn.execute("""
                UPDATE game_portfolios
                SET starting_capital = 50000.0
                WHERE is_active = 0
            """)
            
            # 2. Active seasons: if not migrated yet (cash in 50k/60k and loan in 0/10k)
            conn.execute("""
                UPDATE game_portfolios
                SET starting_capital = 50000.0
                WHERE is_active = 1 
                  AND cash IN (50000.0, 60000.0) 
                  AND loan_principal IN (0.0, 10000.0)
            """)
            
            conn.commit()
            logger.info("Database migration completed.")


# ── User operations ───────────────────────────────────────────────────────────

def upsert_user(google_id: str, email: str, name: str, picture: str) -> Dict:
    """Create a new user or update last_login if they already exist."""
    with _get_conn() as conn:
        conn.execute("""
            INSERT INTO users (id, email, name, picture)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                email      = excluded.email,
                name       = excluded.name,
                picture    = excluded.picture,
                last_login = datetime('now')
        """, (google_id, email, name, picture))
    return {"id": google_id, "email": email, "name": name, "picture": picture}


def get_user(google_id: str) -> Optional[Dict]:
    with _get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (google_id,)).fetchone()
    return dict(row) if row else None


def get_user_by_email(email: str) -> Optional[Dict]:
    with _get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    return dict(row) if row else None


def list_all_users() -> List[Dict]:
    """Admin endpoint — returns all registered users."""
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT id, email, name, created_at, last_login FROM users ORDER BY last_login DESC"
        ).fetchall()
    return [dict(r) for r in rows]


# ── Portfolio operations ──────────────────────────────────────────────────────

def save_portfolio(user_id: str, file_name: str, data: Any) -> None:
    """Upsert (replace) the user's active portfolio snapshot."""
    json_blob = json.dumps(data)
    with _get_conn() as conn:
        existing = conn.execute(
            "SELECT id FROM portfolios WHERE user_id = ?", (user_id,)
        ).fetchone()
        if existing:
            conn.execute("""
                UPDATE portfolios SET file_name=?, data=?, updated_at=datetime('now')
                WHERE user_id=?
            """, (file_name, json_blob, user_id))
        else:
            conn.execute("""
                INSERT INTO portfolios (user_id, file_name, data) VALUES (?, ?, ?)
            """, (user_id, file_name, json_blob))


def load_portfolio(user_id: str) -> Optional[Dict]:
    """Return the user's saved portfolio, or None if not found."""
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT file_name, data, updated_at FROM portfolios WHERE user_id = ?",
            (user_id,)
        ).fetchone()
    if not row:
        return None
    return {
        "file_name": row["file_name"],
        "updated_at": row["updated_at"],
        **json.loads(row["data"])
    }


def delete_portfolio(user_id: str) -> None:
    with _get_conn() as conn:
        conn.execute("DELETE FROM portfolios WHERE user_id = ?", (user_id,))


# ── MF Watchlist operations ───────────────────────────────────────────────────

def save_mf_watchlist(user_id: str, funds: List[Dict]) -> None:
    """Replace the user's entire MF watchlist."""
    with _get_conn() as conn:
        conn.execute("DELETE FROM mf_watchlist WHERE user_id = ?", (user_id,))
        for f in funds:
            conn.execute("""
                INSERT OR IGNORE INTO mf_watchlist (user_id, scheme_code, scheme_name, category)
                VALUES (?, ?, ?, ?)
            """, (user_id, f.get("scheme_code"), f.get("scheme_name"), f.get("category")))


def load_mf_watchlist(user_id: str) -> List[Dict]:
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT scheme_code, scheme_name, category FROM mf_watchlist WHERE user_id = ? ORDER BY added_at",
            (user_id,)
        ).fetchall()
    return [dict(r) for r in rows]
