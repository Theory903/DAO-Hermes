"""Space Enclave status + audit."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Request

from DAO.db import rls_connection
from DAO.deps import current_user_id

router = APIRouter(prefix="/spaces/{space_id}", tags=["enclave"])


@router.get("/enclave/status")
async def enclave_status(space_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        key = await conn.fetchrow(
            "SELECT rotated_at, cmk_arn FROM space_keys WHERE space_id = $1", space_id
        )
        space = await conn.fetchrow("SELECT tier, enclave_config FROM spaces WHERE id = $1", space_id)
    return {
        "encrypted": key is not None,
        "tier": space["tier"] if space else "solo",
        "cmk_arn": key["cmk_arn"] if key else None,
        "rotated_at": key["rotated_at"].isoformat() if key and key["rotated_at"] else None,
        "edge_nodes": [],
    }


@router.get("/audit/export")
async def audit_export(space_id: UUID, request: Request, limit: int = 500):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        rows = await conn.fetch(
            """
            SELECT actor, action, resource, metadata, created_at FROM audit_events
            WHERE space_id = $1 ORDER BY created_at DESC LIMIT $2
            """,
            space_id,
            limit,
        )
    return {"events": [dict(r) for r in rows]}


@router.get("/members")
async def list_members(space_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        rows = await conn.fetch(
            """
            SELECT sm.id, sm.role, sm.created_at, u.email, u.display_name
            FROM space_members sm JOIN users u ON u.id = sm.user_id
            WHERE sm.space_id = $1
            """,
            space_id,
        )
    return {"members": [dict(r) for r in rows]}
