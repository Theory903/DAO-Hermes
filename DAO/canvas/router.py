"""Canvas, workflows, plans, wiki."""

from __future__ import annotations

import json
import re
from uuid import UUID, uuid4

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from DAO.comms import events as event_bus
from DAO.db import rls_connection
from DAO.deps import current_user_id
from DAO.exceptions import NotFoundError

router = APIRouter(tags=["canvas"])


class CompileRequest(BaseModel):
    intent: str


class WorkflowCreate(BaseModel):
    name: str
    graph: dict = Field(default_factory=dict)
    trigger_type: str = "manual"


def _compile_graph(intent: str) -> dict:
    steps = []
    for i, part in enumerate(re.split(r"[,.;]\s*", intent.strip())[:6]):
        if not part:
            continue
        steps.append(
            {
                "id": f"step_{i}",
                "type": "agent",
                "label": part[:80],
                "requires_hitl": "approv" in part.lower() or "email" in part.lower(),
            }
        )
    if not steps:
        steps = [{"id": "step_0", "type": "agent", "label": intent[:80], "requires_hitl": False}]
    return {"nodes": steps, "edges": [{"from": steps[i]["id"], "to": steps[i + 1]["id"]} for i in range(len(steps) - 1)]}


@router.post("/spaces/{space_id}/canvas/compile")
async def compile_canvas(space_id: UUID, body: CompileRequest, request: Request):
    graph = _compile_graph(body.intent)
    return {"graph": graph, "intent": body.intent}


@router.get("/spaces/{space_id}/workflows")
async def list_workflows(space_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        rows = await conn.fetch(
            "SELECT id, name, status, trigger_type, created_at FROM workflows WHERE space_id = $1 ORDER BY created_at DESC",
            space_id,
        )
    return {"workflows": [dict(r) for r in rows]}


@router.post("/spaces/{space_id}/workflows", status_code=201)
async def create_workflow(space_id: UUID, body: WorkflowCreate, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        wid = await conn.fetchval(
            """
            INSERT INTO workflows (space_id, name, graph, trigger_type, status)
            VALUES ($1, $2, $3::jsonb, $4, 'draft') RETURNING id
            """,
            space_id,
            body.name,
            json.dumps(body.graph or _compile_graph(body.name)),
            body.trigger_type,
        )
    return {"id": str(wid)}


@router.get("/spaces/{space_id}/workflows/{workflow_id}")
async def get_workflow(space_id: UUID, workflow_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        row = await conn.fetchrow(
            "SELECT * FROM workflows WHERE space_id = $1 AND id = $2",
            space_id,
            workflow_id,
        )
    if not row:
        raise NotFoundError("Workflow not found")
    return dict(row)


@router.post("/spaces/{space_id}/workflows/{workflow_id}/run")
async def run_workflow(space_id: UUID, workflow_id: UUID, request: Request):
    await event_bus.publish(space_id, "workflow_run", {"workflow_id": str(workflow_id), "status": "started"})
    return {"status": "running", "workflow_id": str(workflow_id)}


@router.post("/spaces/{space_id}/workflows/{workflow_id}/promote")
async def promote_workflow(space_id: UUID, workflow_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        await conn.execute(
            "UPDATE workflows SET status = 'production', promoted_at = now() WHERE id = $2 AND space_id = $1",
            space_id,
            workflow_id,
        )
    return {"status": "production", "workflow_id": str(workflow_id)}


@router.get("/spaces/{space_id}/plans")
async def list_plans(space_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        rows = await conn.fetch(
            """
            SELECT id, name, description, enabled FROM plan_libs
            WHERE space_id = $1 OR space_id IS NULL ORDER BY name
            """,
            space_id,
        )
    return {"plans": [dict(r) for r in rows]}


