"""Platform Tools registry."""

from __future__ import annotations

import json
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from DAO.db import rls_connection
from DAO.deps import current_user_id

router = APIRouter(prefix="/spaces/{space_id}/tools", tags=["tools"])


class ToolCreate(BaseModel):
    name: str
    tool_type: str = "mcp"
    dept_acl: list[str] = Field(default_factory=list)
    config: dict = Field(default_factory=dict)


@router.get("")
async def list_tools(space_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        rows = await conn.fetch(
            "SELECT id, name, tool_type, dept_acl, status, last_health_at FROM platform_tools WHERE space_id = $1",
            space_id,
        )
    defaults = [
        {"name": "delegate", "tool_type": "hermes", "dept_acl": ["executive"], "status": "active"},
        {"name": "browser", "tool_type": "hermes", "dept_acl": ["research", "marketing"], "status": "active"},
        {"name": "terminal", "tool_type": "hermes", "dept_acl": ["engineering", "ops"], "status": "active"},
    ]
    return {"tools": [dict(r) for r in rows] or defaults}


@router.post("", status_code=201)
async def create_tool(space_id: UUID, body: ToolCreate, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        tid = await conn.fetchval(
            """
            INSERT INTO platform_tools (space_id, name, tool_type, dept_acl, config_encrypted, status)
            VALUES ($1,$2,$3,$4,$5,'active') RETURNING id
            """,
            space_id,
            body.name,
            body.tool_type,
            body.dept_acl,
            json.dumps(body.config).encode(),
        )
    return {"id": str(tid)}
