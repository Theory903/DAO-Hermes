"""FastAPI middleware for DAO tenancy."""

from __future__ import annotations

import logging
from uuid import UUID

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from DAO.db import admin_connection
from DAO.exceptions import DAOError
from DAO.runtime import bind_hermes_runtime, unbind_hermes_runtime

_log = logging.getLogger(__name__)

SPACE_HEADER = "x-space-id"


class DAOErrorMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        try:
            return await call_next(request)
        except DAOError as exc:
            return JSONResponse(
                status_code=exc.http_status,
                content={
                    "error": {
                        "code": exc.code,
                        "message": exc.message,
                        "details": exc.details,
                    }
                },
            )


from DAO.spaces.prompt_meta import space_prompt_meta_from_row


class SpaceContextMiddleware(BaseHTTPMiddleware):
    """Resolve space membership, tier, and bind personal + shared Hermes runtime."""

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        if not path.startswith("/api/v1/spaces/"):
            return await call_next(request)

        user = getattr(request.state, "user", None)
        if user is None:
            return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED"}})

        parts = path.split("/")
        if len(parts) < 5:
            return await call_next(request)

        try:
            space_id = UUID(parts[4])
        except ValueError:
            return await call_next(request)

        async with admin_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT sm.role, s.tier, s.org_id, s.name, s.ai_lead_config
                FROM space_members sm
                JOIN spaces s ON s.id = sm.space_id
                WHERE sm.space_id = $1 AND sm.user_id = $2
                """,
                space_id,
                user["id"],
            )
        if row is None:
            return JSONResponse(status_code=403, content={"error": {"code": "FORBIDDEN"}})

        request.state.space_id = space_id
        request.state.space_role = row["role"]
        request.state.space_tier = row["tier"]
        request.state.org_id = row["org_id"]

        meta = space_prompt_meta_from_row(row)

        bind = bind_hermes_runtime(
            user_id=user["id"],
            space_id=space_id,
            org_id=row["org_id"],
            tier=row["tier"],
            space_name=meta.get("space_name"),
            lead_name=meta.get("lead_name"),
            mission=meta.get("mission"),
        )
        request.state.hermes_bind = bind
        try:
            return await call_next(request)
        finally:
            unbind_hermes_runtime(bind)
