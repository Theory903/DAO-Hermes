"""HITL inbox API."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel

from DAO.comms import events as event_bus
from DAO.db import rls_connection
from DAO.deps import current_user_id
from DAO.exceptions import NotFoundError

router = APIRouter(prefix="/spaces/{space_id}/hitl", tags=["hitl"])


class HitlCreate(BaseModel):
    action_summary: str
    tool_trace: dict = {}
    drive_refs: list[UUID] = []
    agent_id: UUID | None = None


class HitlResolve(BaseModel):
    status: str | None = None
    decision: str | None = None

    def resolved_status(self) -> str | None:
        if self.status in ("approved", "rejected"):
            return self.status
        if self.decision == "approve":
            return "approved"
        if self.decision == "reject":
            return "rejected"
        return None


@router.get("")
async def list_hitl(space_id: UUID, request: Request, status: str | None = "pending"):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        if status:
            rows = await conn.fetch(
                """
                SELECT * FROM hitl_requests WHERE space_id = $1 AND status = $2
                ORDER BY created_at DESC
                """,
                space_id,
                status,
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM hitl_requests WHERE space_id = $1 ORDER BY created_at DESC LIMIT 50",
                space_id,
            )
    return {"requests": [dict(r) for r in rows]}


@router.post("", status_code=201)
async def create_hitl(space_id: UUID, body: HitlCreate, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        rid = await conn.fetchval(
            """
            INSERT INTO hitl_requests (
                space_id, agent_id, action_summary, tool_trace, drive_refs, status
            ) VALUES ($1,$2,$3,$4::jsonb,$5,'pending') RETURNING id
            """,
            space_id,
            body.agent_id,
            body.action_summary,
            json.dumps(body.tool_trace),
            body.drive_refs,
        )
    await event_bus.publish(space_id, "hitl_pending", {"id": str(rid), "summary": body.action_summary})
    return {"id": str(rid)}


@router.get("/{request_id}")
async def get_hitl(space_id: UUID, request_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        row = await conn.fetchrow(
            "SELECT * FROM hitl_requests WHERE space_id = $1 AND id = $2",
            space_id,
            request_id,
        )
    if not row:
        raise NotFoundError("HITL request not found")
    return dict(row)


@router.post("/{request_id}/resolve")
async def resolve_hitl(space_id: UUID, request_id: UUID, body: HitlResolve, request: Request):
    status = body.resolved_status()
    if status not in ("approved", "rejected"):
        return {"error": "invalid status"}
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        await conn.execute(
            """
            UPDATE hitl_requests SET status = $3, resolved_by = $4, resolved_at = $5
            WHERE id = $2 AND space_id = $1
            """,
            space_id,
            request_id,
            status,
            current_user_id(request),
            datetime.now(timezone.utc),
        )
    await event_bus.publish(
        space_id,
        "hitl_resolved",
        {"id": str(request_id), "status": status},
    )
    return {"ok": True, "status": status}
