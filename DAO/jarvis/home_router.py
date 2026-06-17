"""Home 6.0 API routes."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Request

from DAO.auth.profile import _as_dict
from DAO.auth.repository import update_user_profile
from DAO.comms import events as event_bus
from DAO.db import admin_connection, rls_connection
from DAO.deps import current_user_id
from DAO.exceptions import NotFoundError
from DAO.jarvis import home as home_svc
from DAO.jarvis.home_greeting import attach_home_greeting

router = APIRouter(prefix="/spaces/{space_id}/home", tags=["home"])


@router.get("")
async def get_home(space_id: UUID, request: Request):
    user_id = current_user_id(request)
    async with rls_connection(space_id=space_id, user_id=user_id) as conn:
        preferences = None
        async with admin_connection() as admin_conn:
            row = await admin_conn.fetchrow(
                "SELECT preferences FROM users WHERE id = $1",
                user_id,
            )
            preferences = row["preferences"] if row else {}
        bundle = await home_svc.build_home_bundle(conn, space_id, preferences=preferences)
        bundle["pulse"] = await attach_home_greeting(
            conn,
            space_id,
            request,
            dict(bundle.get("pulse") or {}),
        )
    return bundle


@router.post("/focus/{request_id}/approve")
async def approve_focus(space_id: UUID, request_id: UUID, request: Request):
    user_id = current_user_id(request)
    async with rls_connection(space_id=space_id, user_id=user_id) as conn:
        row = await conn.fetchrow(
            "SELECT id, status FROM hitl_requests WHERE space_id = $1 AND id = $2",
            space_id,
            request_id,
        )
        if not row:
            raise NotFoundError("Focus item not found")
        if row["status"] != "pending":
            return {"ok": True, "status": row["status"], "already_resolved": True}
        await conn.execute(
            """
            UPDATE hitl_requests
            SET status = 'approved', resolved_by = $3, resolved_at = $4
            WHERE id = $2 AND space_id = $1
            """,
            space_id,
            request_id,
            user_id,
            datetime.now(timezone.utc),
        )
    await event_bus.publish(
        space_id,
        "hitl_resolved",
        {"id": str(request_id), "status": "approved", "source": "home_focus"},
    )
    return {"ok": True, "status": "approved"}


@router.post("/focus/{request_id}/ignore")
async def ignore_focus(space_id: UUID, request_id: UUID, request: Request):
    user_id = current_user_id(request)
    expiry = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    async with admin_connection() as admin_conn:
        row = await admin_conn.fetchrow(
            "SELECT preferences FROM users WHERE id = $1",
            user_id,
        )
        prefs = _as_dict(row["preferences"] if row else {})
        snooze = dict(_as_dict(prefs.get("home_focus_snooze")))
        snooze[str(request_id)] = expiry
        await update_user_profile(
            admin_conn,
            user_id,
            preferences_patch={"home_focus_snooze": snooze},
        )
    return {"ok": True, "snoozed_until": expiry}
