"""Company Brain entities."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Request

from DAO.db import rls_connection
from DAO.deps import current_user_id
from DAO.exceptions import NotFoundError

router = APIRouter(prefix="/spaces/{space_id}/brain", tags=["brain"])


@router.get("/entities")
async def list_entities(space_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        rows = await conn.fetch(
            """
            SELECT slug, title, confidence, updated_at FROM brain_entities
            WHERE space_id = $1 ORDER BY updated_at DESC
            """,
            space_id,
        )
    return {"entities": [dict(r) for r in rows]}


@router.get("/entities/{slug}")
async def get_entity(space_id: UUID, slug: str, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        row = await conn.fetchrow(
            "SELECT * FROM brain_entities WHERE space_id = $1 AND slug = $2",
            space_id,
            slug,
        )
    if not row:
        raise NotFoundError(f"Brain entity not found: {slug}")
    return dict(row)
