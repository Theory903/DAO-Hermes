"""Memory lens REST API."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Request

from DAO.db import rls_connection
from DAO.deps import current_user_id
from DAO.exceptions import NotFoundError
from DAO.memory import search as memory_search
from DAO.objects import service as graph

router = APIRouter(prefix="/spaces/{space_id}", tags=["memory"])


@router.get("/memory/entities")
async def list_memory_entities(space_id: UUID, request: Request):
    """Compiled truths (formerly ``GET /brain/entities``)."""
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        rows = await conn.fetch(
            """
            SELECT id, slug, title, confidence, updated_at FROM brain_entities
            WHERE space_id = $1 ORDER BY updated_at DESC
            """,
            space_id,
        )
    return {"entities": [dict(r) for r in rows]}


@router.get("/memory/entities/{slug}")
async def get_memory_entity(space_id: UUID, slug: str, request: Request):
    """Single compiled truth (formerly ``GET /brain/entities/{slug}``)."""
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        row = await conn.fetchrow(
            "SELECT * FROM brain_entities WHERE space_id = $1 AND slug = $2",
            space_id,
            slug,
        )
    if not row:
        raise NotFoundError(f"Memory entity not found: {slug}")
    return dict(row)


@router.get("/memory/search")
async def memory_search_route(
    space_id: UUID,
    request: Request,
    q: str = "",
    object_type: str | None = None,
    status: str | None = None,
    limit: int = 25,
):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        objects = await memory_search.search_memory(
            conn,
            space_id,
            q,
            object_type=object_type,
            status=status,
            limit=limit,
        )
    return {"objects": objects, "q": q}


@router.get("/memory/timeline")
async def memory_timeline(
    space_id: UUID,
    request: Request,
    importance_gte: int = 5,
    limit: int = 50,
):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        events = await graph.get_timeline(
            conn,
            space_id,
            None,
            importance_gte=importance_gte,
            limit=limit,
        )
    return {"events": events}
