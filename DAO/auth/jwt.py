"""JWT helpers for DAO auth."""

from __future__ import annotations

import time
from typing import Any
from uuid import UUID

from DAO.config import jwt_secret


def _b64url_encode(data: bytes) -> str:
    import base64

    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    import base64

    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def _sign(message: bytes) -> str:
    import hashlib
    import hmac

    sig = hmac.new(jwt_secret().encode(), message, hashlib.sha256).digest()
    return _b64url_encode(sig)


def issue_token(*, user_id: UUID, email: str, hours: int | None = None) -> str:
    from DAO.config import jwt_expiry_hours

    ttl_hours = hours if hours is not None else jwt_expiry_hours()
    import json

    header = _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": int(time.time()) + ttl_hours * 3600,
    }
    body = _b64url_encode(json.dumps(payload).encode())
    signing_input = f"{header}.{body}".encode()
    return f"{header}.{body}.{_sign(signing_input)}"


def verify_token(token: str) -> dict[str, Any]:
    import json

    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid token")

    signing_input = f"{parts[0]}.{parts[1]}".encode()
    if not hmac_compare(_sign(signing_input), parts[2]):
        raise ValueError("Invalid signature")

    payload = json.loads(_b64url_decode(parts[1]))
    if payload.get("exp", 0) < time.time():
        raise ValueError("Token expired")
    return payload


def hmac_compare(a: str, b: str) -> bool:
    import hmac

    return hmac.compare_digest(a, b)
