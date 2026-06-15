"""Space REST routes."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel, EmailStr, Field

from DAO.audit import log_audit_event
from DAO.db import admin_connection, rls_connection
from DAO.deps import require_space_role
from DAO.exceptions import ConflictError, NotFoundError, ValidationError
from DAO.spaces import repository as repo
from DAO.spaces.models import (
    Space,
    SpaceCreate,
    SpaceMember,
    SpaceMemberUpdate,
    SpaceUpdate,
)

router = APIRouter(tags=["spaces"])


class MemberInvite(BaseModel):
    email: EmailStr
    role: str = Field(default="member", pattern="^(admin|member|viewer)$")


def _user_id(request: Request) -> UUID:
    return request.state.user["id"]


@router.get("/spaces", response_model=list[Space])
async def list_spaces(request: Request):
    async with admin_connection() as conn:
        return await repo.list_spaces_for_user(conn, _user_id(request))


@router.post("/spaces", response_model=Space, status_code=201)
async def create_space(payload: SpaceCreate, request: Request):
    async with admin_connection() as conn:
        return await repo.create_space(conn, user_id=_user_id(request), payload=payload)


@router.get("/spaces/by-slug/{slug}", response_model=Space)
async def get_space_by_slug(slug: str, request: Request):
    async with admin_connection() as conn:
        row = await conn.fetchrow(
            """
            SELECT s.* FROM spaces s
            JOIN space_members sm ON sm.space_id = s.id
            WHERE s.slug = $1 AND sm.user_id = $2
            """,
            slug,
            _user_id(request),
        )
    if row is None:
        from DAO.exceptions import NotFoundError

        raise NotFoundError("Space not found")
    from DAO.spaces.repository import _row_to_space

    return _row_to_space(row)


@router.get("/spaces/{space_id}", response_model=Space)
async def get_space(space_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=_user_id(request)) as conn:
        return await repo.get_space(conn, space_id)


@router.patch("/spaces/{space_id}", response_model=Space)
async def update_space(space_id: UUID, payload: SpaceUpdate, request: Request):
    async with rls_connection(space_id=space_id, user_id=_user_id(request)) as conn:
        return await repo.update_space(conn, space_id, payload)


@router.get("/spaces/{space_id}/members", response_model=list[SpaceMember])
async def list_members(space_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=_user_id(request)) as conn:
        return await repo.list_space_members(conn, space_id)


@router.post("/spaces/{space_id}/members", response_model=SpaceMember, status_code=201)
async def invite_member(space_id: UUID, payload: MemberInvite, request: Request):
    require_space_role(request, "owner", "admin")
    actor = str(_user_id(request))
    async with rls_connection(space_id=space_id, user_id=_user_id(request)) as conn:
        member = await repo.invite_space_member(
            conn, space_id, email=payload.email, role=payload.role
        )
        await log_audit_event(
            conn,
            space_id=space_id,
            actor=actor,
            action="member.invite",
            resource=str(member.user_id),
            metadata={"email": payload.email, "role": payload.role},
        )
        return member


@router.patch("/spaces/{space_id}/members/{member_id}", response_model=SpaceMember)
async def update_member(
    space_id: UUID,
    member_id: UUID,
    payload: SpaceMemberUpdate,
    request: Request,
):
    require_space_role(request, "owner", "admin")
    actor = str(_user_id(request))
    async with rls_connection(space_id=space_id, user_id=_user_id(request)) as conn:
        member = await repo.update_space_member_role(
            conn, space_id, member_id, payload.role
        )
        await log_audit_event(
            conn,
            space_id=space_id,
            actor=actor,
            action="member.role_update",
            resource=str(member.user_id),
            metadata={"role": payload.role},
        )
        return member


@router.delete("/spaces/{space_id}/members/{member_id}", status_code=204)
async def remove_member(space_id: UUID, member_id: UUID, request: Request):
    require_space_role(request, "owner", "admin")
    actor = str(_user_id(request))
    async with rls_connection(space_id=space_id, user_id=_user_id(request)) as conn:
        removed = await repo.remove_space_member(conn, space_id, member_id)
        await log_audit_event(
            conn,
            space_id=space_id,
            actor=actor,
            action="member.remove",
            resource=str(removed.user_id),
            metadata={"email": removed.email},
        )
