from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from .config import settings

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return _hasher.verify(hashed, password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def create_token(user_id: str, company_id: str | None, impersonator_id: str | None = None,
                 minutes: int | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "cid": company_id,
        "iat": now,
        "exp": now + timedelta(minutes=minutes or settings.jwt_expire_minutes),
    }
    if impersonator_id:
        payload["imp"] = impersonator_id
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
