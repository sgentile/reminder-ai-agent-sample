import threading
import time
from datetime import datetime, timedelta, timezone

import db
import settings


def _format_interval(seconds: int) -> str:
    if seconds < 60:
        return f"{seconds} second{'s' if seconds != 1 else ''}"
    if seconds < 3600:
        m = seconds // 60
        return f"{m} minute{'s' if m != 1 else ''}"
    h = seconds // 3600
    return f"{h} hour{'s' if h != 1 else ''}"


def _row_to_dict(row) -> dict:
    """Convert a DB row tuple to a reminder dict compatible with the REST API."""
    return {
        "id": row[0],
        "user_id": str(row[1]),
        "description": row[2],
        "due_time": row[3].isoformat(),
        "recurring": row[4],
        "interval_seconds": row[5],
        "notified": row[6],
    }


# --- Tool implementations ---

def add_reminder(user_id: str, description: str, due_time: str) -> str:
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO reminders (user_id, description, due_time, recurring, interval_seconds, notified)
            VALUES (%s, %s, %s, FALSE, NULL, FALSE)
            RETURNING id
        """, (user_id, description, due_time))
        reminder_id = cur.fetchone()[0]
    return f"Reminder #{reminder_id} saved: '{description}' due at {due_time}"


def add_recurring_reminder(user_id: str, description: str, start_time: str, interval_seconds: int) -> str:
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO reminders (user_id, description, due_time, recurring, interval_seconds, notified)
            VALUES (%s, %s, %s, TRUE, %s, FALSE)
            RETURNING id
        """, (user_id, description, start_time, interval_seconds))
        reminder_id = cur.fetchone()[0]
    return (
        f"Recurring reminder #{reminder_id} saved: '{description}' "
        f"starting at {start_time}, repeating every {_format_interval(interval_seconds)}"
    )


def list_reminders(user_id: str) -> str:
    with db.cursor() as cur:
        cur.execute("""
            SELECT id, user_id, description, due_time, recurring, interval_seconds, notified
            FROM reminders
            WHERE user_id = %s AND notified = FALSE
            ORDER BY due_time
        """, (user_id,))
        rows = cur.fetchall()
    if not rows:
        return "No pending reminders."
    local_tz = settings.get_tz(user_id)
    lines = []
    for row in rows:
        r = _row_to_dict(row)
        try:
            due_utc = datetime.fromisoformat(r["due_time"])
            due_local = due_utc.astimezone(local_tz)
            time_str = due_local.strftime("%Y-%m-%d %H:%M %Z")
        except ValueError:
            time_str = r["due_time"]
        prefix = "🔁" if r["recurring"] else "🔔"
        suffix = f" (every {_format_interval(r['interval_seconds'])})" if r["recurring"] else ""
        lines.append(f"#{r['id']} {prefix} [{time_str}]{suffix} {r['description']}")
    return "\n".join(lines)


def get_reminders_list(user_id: str) -> list:
    """Return all non-notified reminders for a user (for the REST API)."""
    with db.cursor() as cur:
        cur.execute("""
            SELECT id, user_id, description, due_time, recurring, interval_seconds, notified
            FROM reminders
            WHERE user_id = %s AND notified = FALSE
            ORDER BY due_time
        """, (user_id,))
        rows = cur.fetchall()
    return [_row_to_dict(row) for row in rows]


def delete_reminder(user_id: str, reminder_id: int) -> str:
    with db.cursor() as cur:
        cur.execute(
            "DELETE FROM reminders WHERE id = %s AND user_id = %s RETURNING id",
            (reminder_id, user_id),
        )
        deleted = cur.fetchone()
    if not deleted:
        return f"No reminder with id #{reminder_id}"
    return f"Reminder #{reminder_id} deleted."


# --- Background notification checker ---

_notify_fn = None


def start_checker(notify_fn=None) -> None:
    global _notify_fn
    _notify_fn = notify_fn
    thread = threading.Thread(target=_check_loop, daemon=True)
    thread.start()


def _check_loop() -> None:
    while True:
        time.sleep(5)
        now = datetime.now(timezone.utc)
        try:
            with db.cursor() as cur:
                cur.execute("""
                    SELECT id, user_id, description, due_time, recurring, interval_seconds
                    FROM reminders
                    WHERE notified = FALSE AND due_time <= %s
                """, (now,))
                due_rows = cur.fetchall()

            for row in due_rows:
                reminder_id, user_id, description, due, recurring, interval_seconds = row
                user_id = str(user_id)
                due_local = due.astimezone(settings.get_tz(user_id))
                time_str = due_local.strftime("%H:%M:%S %Z")
                icon = "🔁" if recurring else "🔔"
                msg = f"{icon} REMINDER ({time_str}): {description}"
                print(f"\n\n{msg} [{user_id[:8]}]", flush=True)
                if _notify_fn:
                    _notify_fn(user_id, msg, reminder_id, recurring)

                if recurring and interval_seconds:
                    next_due = due + timedelta(seconds=interval_seconds)
                    while next_due <= now:
                        next_due += timedelta(seconds=interval_seconds)
                    with db.cursor() as cur:
                        cur.execute(
                            "UPDATE reminders SET due_time = %s WHERE id = %s",
                            (next_due, reminder_id),
                        )
                else:
                    with db.cursor() as cur:
                        cur.execute(
                            "UPDATE reminders SET notified = TRUE WHERE id = %s",
                            (reminder_id,),
                        )
        except Exception as e:
            print(f"[reminder_checker] error: {e}", flush=True)
