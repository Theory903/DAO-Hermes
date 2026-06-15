"""Google + GitHub OAuth 2.0 for DAO login."""

from __future__ import annotations

import json
import logging
import secrets
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode
from uuid import UUID

import httpx

from DAO.config import (
    DAO_web_url,
    github_oauth_client_id,
    github_oauth_client_secret,
    google_oauth_client_id,
    google_oauth_client_secret,
    oauth_callback_url,
    redis_url,
)

_log = logging.getLogger(__name__)

_STATE_TTL_SEC = 600
_EXCHANGE_TTL_SEC = 60

_memory_states: dict[str, tuple[float, str]] = {}


@dataclass(frozen=True)
class OAuthState:
    provider: str
    redirect_uri: str
    mode: str  # web | desktop


@dataclass(frozen=True)
class OAuthProfile:
    provider: str
    subject: str
    email: str
    display_name: str


def oauth_configured(provider: str) -> bool:
    if provider == "google":
        return bool(google_oauth_client_id() and google_oauth_client_secret())
    if provider == "github":
        return bool(github_oauth_client_id() and github_oauth_client_secret())
    return False


def supported_providers() -> list[str]:
    out: list[str] = []
    if oauth_configured("google"):
        out.append("google")
    if oauth_configured("github"):
        out.append("github")
    return out


def _purge_memory(store: dict[str, tuple[float, str]]) -> None:
    now = time.time()
    for key in list(store):
        if store[key][0] < now:
            del store[key]


def _store_kv(key: str, value: str, ttl: int) -> None:
    url = redis_url()
    if url:
        try:
            import redis

            r = redis.from_url(url)
            r.setex(key, ttl, value)
            return
        except Exception as exc:
            _log.debug("Redis KV store failed, using memory: %s", exc)
    _purge_memory(_memory_states)
    _memory_states[key] = (time.time() + ttl, value)


def _pop_kv(key: str) -> str | None:
    url = redis_url()
    if url:
        try:
            import redis

            r = redis.from_url(url)
            raw = r.get(key)
            if raw is None:
                return None
            r.delete(key)
            return raw.decode() if isinstance(raw, bytes) else str(raw)
        except Exception as exc:
            _log.debug("Redis KV pop failed, using memory: %s", exc)
    _purge_memory(_memory_states)
    item = _memory_states.pop(key, None)
    if item is None:
        return None
    if item[0] < time.time():
        return None
    return item[1]


def create_oauth_state(*, provider: str, redirect_uri: str, mode: str) -> str:
    state = secrets.token_urlsafe(24)
    payload = json.dumps(
        {"provider": provider, "redirect_uri": redirect_uri, "mode": mode}
    )
    _store_kv(f"oauth_state:{state}", payload, _STATE_TTL_SEC)
    return state


def consume_oauth_state(state: str) -> OAuthState:
    raw = _pop_kv(f"oauth_state:{state}")
    if not raw:
        raise ValueError("invalid or expired OAuth state")
    data = json.loads(raw)
    return OAuthState(
        provider=str(data["provider"]),
        redirect_uri=str(data["redirect_uri"]),
        mode=str(data.get("mode") or "web"),
    )


def store_exchange_code(token: str) -> str:
    code = secrets.token_urlsafe(32)
    _store_kv(f"oauth_exchange:{code}", token, _EXCHANGE_TTL_SEC)
    return code


def consume_exchange_code(code: str) -> str:
    raw = _pop_kv(f"oauth_exchange:{code}")
    if not raw:
        raise ValueError("invalid or expired exchange code")
    return raw


def authorization_url(*, provider: str, state: str) -> str:
    callback = oauth_callback_url()
    if provider == "google":
        params = {
            "client_id": google_oauth_client_id(),
            "redirect_uri": callback,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "online",
            "prompt": "select_account",
        }
        return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    if provider == "github":
        params = {
            "client_id": github_oauth_client_id(),
            "redirect_uri": callback,
            "scope": "user:email",
            "state": state,
        }
        return f"https://github.com/login/oauth/authorize?{urlencode(params)}"
    raise ValueError(f"unsupported provider: {provider}")


async def exchange_code(*, provider: str, code: str) -> OAuthProfile:
    callback = oauth_callback_url()
    if provider == "google":
        return await _exchange_google(code, callback)
    if provider == "github":
        return await _exchange_github(code, callback)
    raise ValueError(f"unsupported provider: {provider}")


async def _exchange_google(code: str, redirect_uri: str) -> OAuthProfile:
    async with httpx.AsyncClient(timeout=20.0) as client:
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": google_oauth_client_id(),
                "client_secret": google_oauth_client_secret(),
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        token_res.raise_for_status()
        access_token = token_res.json().get("access_token")
        if not access_token:
            raise ValueError("Google token response missing access_token")
        user_res = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        user_res.raise_for_status()
        data = user_res.json()
    email = str(data.get("email") or "").lower()
    if not email:
        raise ValueError("Google account has no email")
    return OAuthProfile(
        provider="google",
        subject=str(data.get("sub") or ""),
        email=email,
        display_name=str(data.get("name") or email.split("@")[0]),
    )


async def _exchange_github(code: str, redirect_uri: str) -> OAuthProfile:
    async with httpx.AsyncClient(timeout=20.0) as client:
        token_res = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": github_oauth_client_id(),
                "client_secret": github_oauth_client_secret(),
                "code": code,
                "redirect_uri": redirect_uri,
            },
        )
        token_res.raise_for_status()
        access_token = token_res.json().get("access_token")
        if not access_token:
            raise ValueError("GitHub token response missing access_token")
        user_res = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
            },
        )
        user_res.raise_for_status()
        user = user_res.json()
        email = str(user.get("email") or "").lower()
        if not email:
            emails_res = await client.get(
                "https://api.github.com/user/emails",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github+json",
                },
            )
            emails_res.raise_for_status()
            for row in emails_res.json():
                if row.get("primary") and row.get("verified"):
                    email = str(row.get("email") or "").lower()
                    break
        if not email:
            raise ValueError("GitHub account has no verified email")
    return OAuthProfile(
        provider="github",
        subject=str(user.get("id") or ""),
        email=email,
        display_name=str(user.get("name") or user.get("login") or email.split("@")[0]),
    )


async def upsert_oauth_user(conn, profile: OAuthProfile) -> tuple[UUID, str]:
    from DAO.vpc import provision_user_vpc

    row = await conn.fetchrow(
        """
        SELECT id, email FROM users
        WHERE oauth_provider = $1 AND oauth_subject = $2
        """,
        profile.provider,
        profile.subject,
    )
    if row is not None:
        user_id = row["id"]
        email = str(row["email"])
    else:
        by_email = await conn.fetchrow(
            "SELECT id, email FROM users WHERE email = $1::text::citext",
            profile.email,
        )
        if by_email is not None:
            user_id = by_email["id"]
            email = str(by_email["email"])
            await conn.execute(
                """
                UPDATE users
                SET oauth_provider = $2, oauth_subject = $3,
                    display_name = COALESCE(display_name, $4)
                WHERE id = $1
                """,
                user_id,
                profile.provider,
                profile.subject,
                profile.display_name,
            )
        else:
            user_id = await conn.fetchval(
                """
                INSERT INTO users (email, display_name, oauth_provider, oauth_subject)
                VALUES ($1::text::citext, $2::text, $3::text, $4::text)
                RETURNING id
                """,
                profile.email,
                profile.display_name,
                profile.provider,
                profile.subject,
            )
            email = profile.email

    provision_user_vpc(user_id)
    return user_id, email
