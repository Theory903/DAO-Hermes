"""Auth middleware and dev login routes."""

from __future__ import annotations

import logging
from urllib.parse import urlencode
from uuid import UUID

from fastapi import APIRouter, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from DAO.auth import jwt as jwt_util
from DAO.auth.cookies import attach_auth_cookie, clear_auth_cookie
from DAO.auth.oauth import (
    authorization_url,
    consume_exchange_code,
    consume_oauth_state,
    create_oauth_state,
    exchange_code,
    oauth_configured,
    store_exchange_code,
    supported_providers,
    upsert_oauth_user,
)
from DAO.config import DAO_deployment, DAO_web_url
from DAO.db import admin_connection
from DAO.exceptions import ForbiddenError, ValidationError
from DAO.auth.profile import normalize_birthday_mm_dd
from DAO.auth.repository import fetch_user_profile, update_user_profile
from DAO.vpc import provision_user_vpc

_log = logging.getLogger(__name__)

router = APIRouter(tags=["auth"])

PUBLIC_PATHS = {
    "/api/v1/health",
    "/api/v1/health/ready",
    "/api/v1/auth/dev-login",
    "/api/v1/auth/login",
    "/api/v1/auth/callback",
    "/api/v1/auth/exchange",
    "/api/v1/auth/providers",
    "/api/v1/auth/logout",
}


class DevLoginRequest(BaseModel):
    email: EmailStr
    display_name: str | None = None


class AuthUserResponse(BaseModel):
    id: UUID
    email: str
    token: str


class ExchangeRequest(BaseModel):
    exchange_code: str


class GreetingPreferencesUpdate(BaseModel):
    use_chat_opener: bool | None = None


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = None
    birthday_mm_dd: str | None = None
    clear_birthday: bool = False
    greeting: GreetingPreferencesUpdate | None = None


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        if not path.startswith("/api/v1/"):
            return await call_next(request)
        if request.method == "OPTIONS":
            return await call_next(request)
        if path in PUBLIC_PATHS:
            return await call_next(request)

        auth = request.headers.get("authorization", "")
        token = None
        if auth.lower().startswith("bearer "):
            token = auth[7:].strip()
        if not token:
            token = request.cookies.get("DAO_token")
        if not token:
            token = request.query_params.get("token")

        if not token:
            return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED"}})

        try:
            claims = jwt_util.verify_token(token)
            request.state.user = {
                "id": UUID(claims["sub"]),
                "email": claims.get("email", ""),
            }
        except ValueError:
            return JSONResponse(status_code=401, content={"error": {"code": "INVALID_TOKEN"}})

        return await call_next(request)


def _auth_response(user_id: UUID, email: str, response: Response) -> AuthUserResponse:
    token = jwt_util.issue_token(user_id=user_id, email=email)
    attach_auth_cookie(response, token)
    return AuthUserResponse(id=user_id, email=email, token=token)


@router.get("/auth/providers")
async def list_auth_providers():
    return {
        "providers": supported_providers(),
        "dev_login": DAO_deployment() != "cloud",
    }


@router.get("/auth/login")
async def oauth_login(
    provider: str = Query(..., pattern="^(google|github)$"),
    redirect_uri: str | None = None,
    mode: str = Query("web", pattern="^(web|desktop)$"),
):
    if not oauth_configured(provider):
        raise ValidationError(f"OAuth provider not configured: {provider}")
    target = redirect_uri or DAO_web_url()
    state = create_oauth_state(provider=provider, redirect_uri=target, mode=mode)
    return RedirectResponse(authorization_url(provider=provider, state=state), status_code=302)


@router.get("/auth/callback")
async def oauth_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    if error:
        raise ValidationError(f"OAuth error: {error}")
    if not code or not state:
        raise ValidationError("Missing OAuth code or state")

    oauth_state = consume_oauth_state(state)
    profile = await exchange_code(provider=oauth_state.provider, code=code)

    async with admin_connection() as conn:
        user_id, email = await upsert_oauth_user(conn, profile)

    token = jwt_util.issue_token(user_id=user_id, email=email)

    if oauth_state.mode == "desktop":
        exchange = store_exchange_code(token)
        sep = "&" if "?" in oauth_state.redirect_uri else "?"
        return RedirectResponse(
            f"{oauth_state.redirect_uri}{sep}{urlencode({'exchange_code': exchange})}",
            status_code=302,
        )

    response = RedirectResponse(oauth_state.redirect_uri, status_code=302)
    attach_auth_cookie(response, token)
    return response


@router.post("/auth/exchange", response_model=AuthUserResponse)
async def oauth_exchange(body: ExchangeRequest, response: Response):
    """Desktop shell exchanges a one-time code from the OAuth callback redirect."""
    try:
        token = consume_exchange_code(body.exchange_code)
        claims = jwt_util.verify_token(token)
        user_id = UUID(claims["sub"])
        email = str(claims.get("email") or "")
    except (ValueError, KeyError) as exc:
        raise ValidationError("Invalid exchange code") from exc
    attach_auth_cookie(response, token)
    return AuthUserResponse(id=user_id, email=email, token=token)


@router.post("/auth/logout")
async def auth_logout(response: Response):
    clear_auth_cookie(response)
    return {"ok": True}


@router.post("/auth/dev-login", response_model=AuthUserResponse)
async def dev_login(payload: DevLoginRequest, response: Response):
    """Development-only login — creates user if missing."""
    if DAO_deployment() == "cloud":
        raise ForbiddenError("dev-login is disabled in cloud deployments")

    email = payload.email.lower()
    display_name = payload.display_name or email.split("@")[0]
    async with admin_connection() as conn:
        row = await conn.fetchrow(
            "SELECT id, email FROM users WHERE email = $1::text::citext",
            email,
        )
        if row is None:
            user_id = await conn.fetchval(
                """
                INSERT INTO users (email, display_name, oauth_provider, oauth_subject)
                VALUES ($1::text::citext, $2::text, 'dev', $3::text)
                RETURNING id
                """,
                email,
                display_name,
                email,
            )
        else:
            user_id = row["id"]
            email = str(row["email"])

    provision_user_vpc(user_id)
    return _auth_response(user_id, str(email), response)


@router.get("/auth/me")
async def auth_me(request: Request):
    from DAO.config import DAO_hermes_vpc_mode
    from DAO.runtime import get_runtime_context, runtime_context_payload
    from DAO.spaces import repository as spaces_repo
    from DAO.vpc import resolve_personal_home

    user_id = request.state.user["id"]
    async with admin_connection() as conn:
        profile = await fetch_user_profile(conn, user_id)
        if profile is None:
            raise ValidationError("User not found")
        spaces = await spaces_repo.list_spaces_for_user(conn, user_id)
    payload = {
        **profile,
        "spaces": [s.model_dump(mode="json") for s in spaces],
        "deployment": DAO_deployment(),
        "oauth_providers": supported_providers(),
        "hermes_vpc_mode": DAO_hermes_vpc_mode(),
        "personal_home": str(resolve_personal_home(user_id, "solo")),
    }
    ctx = get_runtime_context()
    if ctx:
        payload.update(runtime_context_payload(ctx))
    return payload


@router.patch("/auth/me")
async def patch_auth_me(body: ProfileUpdateRequest, request: Request):
    user_id = request.state.user["id"]
    preferences_patch: dict = {}

    if body.clear_birthday:
        preferences_patch["birthday_mm_dd"] = None
    elif body.birthday_mm_dd is not None:
        try:
            preferences_patch["birthday_mm_dd"] = normalize_birthday_mm_dd(body.birthday_mm_dd)
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc

    if body.greeting is not None:
        greeting_patch = body.greeting.model_dump(exclude_none=True)
        if greeting_patch:
            preferences_patch["greeting"] = greeting_patch

    async with admin_connection() as conn:
        try:
            profile = await update_user_profile(
                conn,
                user_id,
                display_name=body.display_name,
                display_name_set=body.display_name is not None,
                preferences_patch=preferences_patch or None,
            )
        except LookupError as exc:
            raise ValidationError("User not found") from exc

    return profile
