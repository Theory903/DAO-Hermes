"""Research Memory / Trace Git REST API."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from DAO.db import rls_connection
from DAO.deps import current_user_id
from DAO.research_memory.service import ResearchMemoryService

router = APIRouter(prefix="/spaces/{space_id}/research-memory", tags=["research-memory"])


class ResolveRequest(BaseModel):
    intent: str
    capability: str = ""
    department: str = ""
    entity_keys: list[str] = Field(default_factory=list)
    max_age_hours: int = 168


class StartSessionRequest(BaseModel):
    intent: str
    capability: str = ""
    department: str = ""
    entity_keys: list[str] = Field(default_factory=list)
    stale_after: datetime | None = None
    thread_slug: str | None = None
    thread_title: str | None = None
    parent_session_id: UUID | None = None
    task_type: str = "task"
    commit_message: str = ""
    agent_id: UUID | None = None
    workflow_id: UUID | None = None
    hermes_session_id: str | None = None


class CreateThreadRequest(BaseModel):
    slug: str
    title: str = ""
    capability: str = ""
    department: str = ""


class AppendTraceRequest(BaseModel):
    step_type: str
    input_summary: str = ""
    output_summary: str = ""
    tool_name: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    drive_refs: list[UUID] = Field(default_factory=list)
    layer_used: int | None = None


class FinalizeRequest(BaseModel):
    drive_ref: UUID | None = None
    cost_usd: float = 0.0
    commit_message: str | None = None


class ContextBundleRequest(BaseModel):
    intent: str
    capability: str = ""
    department: str = ""
    token_budget: int = 8192


@router.post("/resolve")
async def resolve_research(space_id: UUID, body: ResolveRequest, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        svc = ResearchMemoryService(conn, space_id)
        hit = await svc.resolve(
            body.intent,
            body.capability,
            body.department,
            body.entity_keys or None,
            body.max_age_hours,
        )
    return {"reuse": hit is not None, "replay": hit}


@router.post("/threads")
async def create_thread(space_id: UUID, body: CreateThreadRequest, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        svc = ResearchMemoryService(conn, space_id)
        thread = await svc.get_or_create_thread(
            body.slug, body.title, body.capability, body.department
        )
    return thread


@router.get("/threads")
async def list_threads(
    space_id: UUID,
    request: Request,
    capability: str | None = None,
    limit: int = 50,
):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        svc = ResearchMemoryService(conn, space_id)
        return {"threads": await svc.list_threads(capability, limit)}


@router.get("/threads/{thread_id}")
async def get_thread(space_id: UUID, thread_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        svc = ResearchMemoryService(conn, space_id)
        thread = await svc.get_thread(thread_id)
    if not thread:
        return {"error": "thread_not_found"}
    return thread


@router.get("/threads/{thread_id}/log")
async def thread_log(
    space_id: UUID,
    thread_id: UUID,
    request: Request,
    limit: int = 50,
):
    """Git log — all commits on a thread."""
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        svc = ResearchMemoryService(conn, space_id)
        return {"commits": await svc.list_thread_log(thread_id, limit)}


@router.post("/sessions")
async def start_session(space_id: UUID, body: StartSessionRequest, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        svc = ResearchMemoryService(conn, space_id)
        thread_id = None
        if body.thread_slug:
            thread = await svc.get_or_create_thread(
                body.thread_slug,
                title=body.thread_title or body.intent[:120],
                capability=body.capability,
                department=body.department,
            )
            thread_id = thread["id"]
        sid = await svc.start_session(
            body.intent,
            body.capability,
            body.department,
            body.entity_keys or None,
            body.stale_after,
            thread_id=thread_id,
            parent_session_id=body.parent_session_id,
            task_type=body.task_type,
            commit_message=body.commit_message or body.intent[:200],
            agent_id=body.agent_id,
            workflow_id=body.workflow_id,
            hermes_session_id=body.hermes_session_id,
        )
    return {"session_id": str(sid), "thread_id": str(thread_id) if thread_id else None}


@router.post("/sessions/{session_id}/traces")
async def append_trace(
    space_id: UUID,
    session_id: UUID,
    body: AppendTraceRequest,
    request: Request,
):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        svc = ResearchMemoryService(conn, space_id)
        tid = await svc.append_trace(
            session_id,
            body.step_type,
            body.input_summary,
            body.output_summary,
            body.tool_name,
            body.payload,
            body.drive_refs or None,
            body.layer_used,
        )
    return {"trace_id": str(tid)}


@router.post("/sessions/{session_id}/finalize")
async def finalize_session(
    space_id: UUID,
    session_id: UUID,
    body: FinalizeRequest,
    request: Request,
):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        svc = ResearchMemoryService(conn, space_id)
        result = await svc.finalize_session(
            session_id, body.drive_ref, body.cost_usd, body.commit_message
        )
    return result


@router.get("/sessions/{session_id}/checkout")
async def checkout_session(space_id: UUID, session_id: UUID, request: Request):
    """View a past commit — full trace + snapshot metadata."""
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        svc = ResearchMemoryService(conn, space_id)
        return await svc.checkout(session_id)


@router.get("/sessions/{session_id}/expand")
async def expand_trace(
    space_id: UUID,
    session_id: UUID,
    request: Request,
    step_type: str | None = None,
    from_step: int | None = None,
    to_step: int | None = None,
):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        svc = ResearchMemoryService(conn, space_id)
        types = [step_type] if step_type else None
        return await svc.expand_trace(session_id, types, from_step, to_step)


@router.get("/diff")
async def diff_sessions(
    space_id: UUID,
    request: Request,
    left: UUID,
    right: UUID,
):
    """Git diff between two commits."""
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        svc = ResearchMemoryService(conn, space_id)
        return await svc.diff_sessions(left, right)


@router.get("/search")
async def search_traces(space_id: UUID, request: Request, q: str = "", limit: int = 10):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        svc = ResearchMemoryService(conn, space_id)
        return {"results": await svc.search_traces(q, limit)}


@router.post("/context-bundle")
async def context_bundle(space_id: UUID, body: ContextBundleRequest, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        svc = ResearchMemoryService(conn, space_id)
        return await svc.build_context_bundle(
            body.intent,
            body.capability,
            body.department,
            body.token_budget,
        )
