"""Dept skills API."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel

from DAO.db import rls_connection
from DAO.deps import current_user_id

router = APIRouter(prefix="/spaces/{space_id}/skills", tags=["skills"])


class SkillCreate(BaseModel):
    department: str
    name: str
    content: str = ""
    skill_path: str | None = None


@router.get("")
async def list_skills(space_id: UUID, request: Request, dept: str | None = None):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        if dept:
            rows = await conn.fetch(
                "SELECT id, department, name, skill_path, version, updated_at FROM dept_skills WHERE space_id = $1 AND department = $2",
                space_id,
                dept,
            )
        else:
            rows = await conn.fetch(
                "SELECT id, department, name, skill_path, version, updated_at FROM dept_skills WHERE space_id = $1",
                space_id,
            )
    return {"skills": [dict(r) for r in rows]}


@router.post("", status_code=201)
async def create_skill(space_id: UUID, body: SkillCreate, request: Request):
    path = body.skill_path or f"/skills/{body.department}/{body.name}.md"
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        sid = await conn.fetchval(
            """
            INSERT INTO dept_skills (space_id, department, name, skill_path, content)
            VALUES ($1,$2,$3,$4,$5) RETURNING id
            """,
            space_id,
            body.department,
            body.name,
            path,
            body.content,
        )
    return {"id": str(sid), "skill_path": path}
