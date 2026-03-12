import os
from contextlib import contextmanager

from psycopg2.pool import ThreadedConnectionPool

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://agent:agent@localhost:5432/agent"
)

_pool: ThreadedConnectionPool | None = None


def init_db() -> None:
    """Create the connection pool and ensure the schema exists. Call once at startup."""
    global _pool
    _pool = ThreadedConnectionPool(1, 10, DATABASE_URL)
    _create_schema()


@contextmanager
def cursor():
    """Yield a psycopg2 cursor, committing on success or rolling back on error."""
    conn = _pool.getconn()
    try:
        with conn.cursor() as cur:
            yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _pool.putconn(conn)


def _create_schema() -> None:
    with cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id            UUID        PRIMARY KEY,
                email         TEXT        UNIQUE NOT NULL,
                password_hash TEXT        NOT NULL,
                created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS settings (
                user_id  UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                timezone TEXT NOT NULL DEFAULT 'UTC'
            );

            CREATE TABLE IF NOT EXISTS reminders (
                id               SERIAL      PRIMARY KEY,
                user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                description      TEXT        NOT NULL,
                due_time         TIMESTAMPTZ NOT NULL,
                recurring        BOOLEAN     NOT NULL DEFAULT FALSE,
                interval_seconds INTEGER,
                notified         BOOLEAN     NOT NULL DEFAULT FALSE
            );
        """)
