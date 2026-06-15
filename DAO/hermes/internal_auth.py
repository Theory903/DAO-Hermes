"""Signed marker for in-process Hermes API hops from the DAO proxy."""

from __future__ import annotations

import hashlib
import hmac

from DAO.config import jwt_secret

DAO_PROXY_HEADER = "X-DAO-Hermes-Proxy"
_PROXY_SALT = b"DAO-hermes-proxy-v1"


def DAO_proxy_auth_value() -> str:
    return hmac.new(jwt_secret().encode(), _PROXY_SALT, hashlib.sha256).hexdigest()


def is_DAO_proxy_request(header_value: str | None) -> bool:
    if not header_value:
        return False
    try:
        expected = DAO_proxy_auth_value()
    except RuntimeError:
        return False
    return hmac.compare_digest(header_value, expected)
