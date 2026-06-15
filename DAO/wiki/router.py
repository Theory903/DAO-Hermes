"""Company wiki API — Drive-backed llm-wiki at ``/wiki/``."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Request

from DAO.db import rls_connection
from DAO.deps import current_user_id
from DAO.exceptions import NotFoundError
from DAO.wiki import service as wiki_svc

router = APIRouter(prefix="/spaces/{space_id}/wiki", tags=["wiki"])


@router.get("")
async def get_wiki(space_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        snapshot = await wiki_svc.wiki_snapshot(conn, space_id)
    return snapshot


@router.get("/pages/{page_key:path}")
async def get_wiki_page(space_id: UUID, page_key: str, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        try:
            page = await wiki_svc.get_wiki_page(conn, space_id, page_key)
        except KeyError:
            raise NotFoundError(f"Wiki page not found: {page_key}") from None
    return page
