"""Work lens REST API."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Request

from DAO.db import rls_connection
from DAO.deps import current_user_id
from DAO.work import bundle as work_svc

router = APIRouter(prefix="/spaces/{space_id}", tags=["work"])


@router.get("/work/bundle")
async def get_work_bundle(space_id: UUID, request: Request):
    preferences = getattr(request.state, "preferences", None)
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        bundle = await work_svc.build_work_bundle(conn, space_id, preferences=preferences)
    return bundle
