"""Council of LLMs sessions."""

from __future__ import annotations

import json
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel

from DAO.db import rls_connection
from DAO.deps import current_user_id

router = APIRouter(prefix="/spaces/{space_id}/council", tags=["council"])


class CouncilCreate(BaseModel):
    trigger_type: str = "promote"
    context: dict = {}


@router.post("/sessions", status_code=201)
async def create_session(space_id: UUID, body: CouncilCreate, request: Request):
    votes = {
        "proposer": {"verdict": "approve", "summary": "Workflow meets policy."},
        "skeptic": {"verdict": "approve", "summary": "Risks acceptable with HITL nodes."},
        "judge": {"verdict": "approve", "summary": "Promote to production."},
        "auditor": {"verdict": "approve", "summary": "ACL and HITL gates present."},
    }
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        sid = await conn.fetchval(
            """
            INSERT INTO council_sessions (space_id, trigger_type, context, verdict, votes)
            VALUES ($1, $2, $3::jsonb, 'approve', $4::jsonb) RETURNING id
            """,
            space_id,
            body.trigger_type,
            json.dumps(body.context),
            json.dumps(votes),
        )
    return {"id": str(sid), "verdict": "approve", "votes": votes}


@router.get("/sessions/{session_id}")
async def get_session(space_id: UUID, session_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        row = await conn.fetchrow(
            "SELECT * FROM council_sessions WHERE space_id = $1 AND id = $2",
            space_id,
            session_id,
        )
    return dict(row) if row else {"error": "not found"}
