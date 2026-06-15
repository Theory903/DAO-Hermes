"""WebSocket ticket minting."""

from __future__ import annotations

import secrets
import time
from dataclasses import dataclass
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel

from DAO.auth import jwt as jwt_util
from DAO.config import DAO_deployment, redis_url

router = APIRouter(tags=["ws"])


class WSTicketResponse(BaseModel):
    ticket: str
    expires_in: int = 60


@dataclass
class WSTicketClaims:
    sub: UUID
    space_id: UUID
    exp: int
    jti: str


def _mint_ticket(user_id: UUID, space_id: UUID) -> str:
    jti = secrets.token_urlsafe(16)
    claims = {
        "sub": str(user_id),
        "space_id": str(space_id),
        "exp": int(time.time()) + 60,
        "jti": jti,
        "typ": "ws_ticket",
    }
    import json
    from DAO.auth.jwt import _b64url_encode, _sign

    header = _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = _b64url_encode(json.dumps(claims).encode())
    signing_input = f"{header}.{body}".encode()
    return f"{header}.{body}.{_sign(signing_input)}"


class WSTicketInvalid(Exception):
    """Raised when a DAO WS ticket cannot be consumed."""


def consume_ws_ticket(ticket: str) -> dict[str, str]:
    """Validate a DAO WS JWT and optionally consume its Redis single-use slot."""
    try:
        claims = jwt_util.verify_token(ticket)
    except ValueError as exc:
        raise WSTicketInvalid(str(exc)) from exc

    if claims.get("typ") != "ws_ticket":
        raise WSTicketInvalid("wrong ticket type")

    user_id = claims.get("sub")
    space_id = claims.get("space_id")
    if not user_id or not space_id:
        raise WSTicketInvalid("missing claims")

    url = redis_url()
    if DAO_deployment() == "cloud":
        if not url:
            raise WSTicketInvalid("redis required for ws tickets in cloud")
        import redis

        r = redis.from_url(url)
        if not r.delete(f"ws_ticket:{ticket[-16:]}"):
            raise WSTicketInvalid("ticket already used or expired")
    elif url:
        try:
            import redis

            r = redis.from_url(url)
            if not r.delete(f"ws_ticket:{ticket[-16:]}"):
                raise WSTicketInvalid("ticket already used or expired")
        except WSTicketInvalid:
            raise
        except Exception:
            pass

    return {
        "user_id": str(user_id),
        "space_id": str(space_id),
        "jti": str(claims.get("jti", "")),
    }


@router.post("/spaces/{space_id}/ws/ticket", response_model=WSTicketResponse)
async def create_ws_ticket(space_id: UUID, request: Request):
    user_id = request.state.user["id"]
    ticket = _mint_ticket(user_id, space_id)
    # Redis single-use tracking — optional when Redis unavailable in dev
    url = redis_url()
    if DAO_deployment() == "cloud":
        if not url:
            from DAO.exceptions import ServiceUnavailableError

            raise ServiceUnavailableError("REDIS_URL required for WS tickets in cloud")
        import redis

        r = redis.from_url(url)
        r.setex(f"ws_ticket:{ticket[-16:]}", 60, "1")
    elif url:
        try:
            import redis

            r = redis.from_url(url)
            r.setex(f"ws_ticket:{ticket[-16:]}", 60, "1")
        except Exception:
            pass
    return WSTicketResponse(ticket=ticket)
