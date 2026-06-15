"""Simple in-memory rate limiting for auth endpoints."""

from __future__ import annotations

import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

_WINDOW_SEC = 60
_MAX_AUTH_ATTEMPTS = 30
_buckets: dict[str, deque[float]] = defaultdict(deque)


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def _allow(key: str, *, limit: int = _MAX_AUTH_ATTEMPTS) -> bool:
    now = time.monotonic()
    bucket = _buckets[key]
    while bucket and now - bucket[0] > _WINDOW_SEC:
        bucket.popleft()
    if len(bucket) >= limit:
        return False
    bucket.append(now)
    return True


class AuthRateLimitMiddleware(BaseHTTPMiddleware):
    """Throttle `/api/v1/auth/*` to reduce brute-force and dev-login abuse."""

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        if path.startswith("/api/v1/auth/") and request.method == "POST":
            if not _allow(_client_key(request)):
                return JSONResponse(
                    status_code=429,
                    content={"error": {"code": "RATE_LIMITED", "message": "Too many auth attempts"}},
                )
        return await call_next(request)
