import json
from datetime import timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import db


def get_tz(user_id: str):
    with db.cursor() as cur:
        cur.execute("SELECT timezone FROM settings WHERE user_id = %s", (user_id,))
        row = cur.fetchone()
    if row:
        try:
            return ZoneInfo(row[0])
        except ZoneInfoNotFoundError:
            pass
    return timezone.utc


# --- Tool implementations ---

def get_user_settings(user_id: str) -> str:
    with db.cursor() as cur:
        cur.execute("SELECT timezone FROM settings WHERE user_id = %s", (user_id,))
        row = cur.fetchone()
    if not row:
        return "No settings saved yet. Timezone is not set."
    return json.dumps({"timezone": row[0]})


def set_timezone(user_id: str, tz: str) -> str:
    try:
        ZoneInfo(tz)
    except ZoneInfoNotFoundError:
        return f"Unknown timezone '{tz}'. Use IANA format like 'America/New_York' or 'Europe/London'."
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO settings (user_id, timezone) VALUES (%s, %s)
            ON CONFLICT (user_id) DO UPDATE SET timezone = EXCLUDED.timezone
        """, (user_id, tz))
    return f"Timezone saved as {tz}."
