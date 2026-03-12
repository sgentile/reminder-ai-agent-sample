import os
import uuid
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

import db

JWT_SECRET = os.environ.get("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24

_pwd = CryptContext(schemes=["bcrypt_sha256"], deprecated="auto")


def register(email: str, password: str) -> dict:
    """Create a new user. Returns the user dict on success or raises ValueError."""
    with db.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cur.fetchone():
            raise ValueError(f"Email already registered: {email}")
        user_id = str(uuid.uuid4())
        cur.execute(
            "INSERT INTO users (id, email, password_hash) VALUES (%s, %s, %s)",
            (user_id, email, _pwd.hash(password)),
        )
    return {"id": user_id, "email": email}


def login(email: str, password: str) -> str:
    """Verify credentials and return a signed JWT. Raises ValueError on failure."""
    with db.cursor() as cur:
        cur.execute("SELECT id, password_hash FROM users WHERE email = %s", (email,))
        row = cur.fetchone()
    if not row or not _pwd.verify(password, row[1]):
        raise ValueError("Invalid email or password.")
    return _create_token(str(row[0]))


def decode_token(token: str) -> str:
    """Validate a JWT and return the user_id (sub claim). Raises ValueError on failure."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        if not user_id:
            raise ValueError("Token missing subject.")
        return user_id
    except JWTError as e:
        raise ValueError(f"Invalid token: {e}")


def _create_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    return jwt.encode({"sub": user_id, "exp": expire}, JWT_SECRET, algorithm=JWT_ALGORITHM)
