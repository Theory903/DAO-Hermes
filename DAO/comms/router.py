"""Inter-dept bus + Command Center + SSE."""

from __future__ import annotations

import asyncio
import json
from uuid import UUID

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from DAO.comms import events as event_bus
from DAO.db import rls_connection
from DAO.deps import current_space_id, current_space_role, current_user_id
from DAO.exceptions import ForbiddenError

router = APIRouter(tags=["comms"])


class InterDeptCreate(BaseModel):
    from_dept: str
    to_dept: str
    msg_type: str = "handoff"
    subject: str = ""
    drive_refs: list[UUID] = Field(default_factory=list)
    skill_refs: list[UUID] = Field(default_factory=list)
    payload: dict = Field(default_factory=dict)


@router.get("/spaces/{space_id}/comms/interdept")
async def list_interdept(space_id: UUID, request: Request, limit: int = 50):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        rows = await conn.fetch(
            """
            SELECT * FROM interdept_messages WHERE space_id = $1
            ORDER BY created_at DESC LIMIT $2
            """,
            space_id,
            limit,
        )
    return {"messages": [dict(r) for r in rows]}


@router.post("/spaces/{space_id}/comms/interdept", status_code=201)
async def create_interdept(space_id: UUID, body: InterDeptCreate, request: Request):
    role = current_space_role(request)
    if role not in ("owner", "admin", "member"):
        raise ForbiddenError("Insufficient role for inter-dept message")

    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        mid = await conn.fetchval(
            """
            INSERT INTO interdept_messages (
                space_id, from_dept, to_dept, msg_type, subject,
                drive_refs, skill_refs, payload
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING id
            """,
            space_id,
            body.from_dept,
            body.to_dept,
            body.msg_type,
            body.subject,
            body.drive_refs,
            body.skill_refs,
            json.dumps(body.payload),
        )

    await event_bus.publish(
        space_id,
        "handoff",
        {
            "id": str(mid),
            "from_dept": body.from_dept,
            "to_dept": body.to_dept,
            "subject": body.subject,
        },
    )
    return {"id": str(mid)}


@router.get("/spaces/{space_id}/command/snapshot")
async def command_snapshot(space_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        agents = await conn.fetch(
            """
            SELECT department, agent_type, name FROM agents
            WHERE space_id = $1 AND agent_type IN ('ai_lead', 'lead')
            ORDER BY department
            """,
            space_id,
        )
        pending_hitl = await conn.fetchval(
            "SELECT count(*) FROM hitl_requests WHERE space_id = $1 AND status = 'pending'",
            space_id,
        )
        recent = await conn.fetch(
            """
            SELECT from_dept, to_dept, subject, created_at FROM interdept_messages
            WHERE space_id = $1 ORDER BY created_at DESC LIMIT 10
            """,
            space_id,
        )
        depts = await event_bus.dept_status_for_space(conn, space_id)
    return {
        "ai_lead": next((a["name"] for a in agents if a["agent_type"] == "ai_lead"), "Jarvis"),
        "departments": depts,
        "pending_hitl": pending_hitl,
        "recent_handoffs": [dict(r) for r in recent],
    }


@router.get("/spaces/{space_id}/events")
async def sse_events(space_id: UUID, request: Request):
    async def stream():
        yield f"data: {json.dumps({'type': 'connected', 'space_id': str(space_id)})}\n\n"
        async for msg in event_bus.subscribe(space_id):
            yield f"data: {msg}\n\n"
            await asyncio.sleep(0)

    return StreamingResponse(stream(), media_type="text/event-stream")
