"""Org chart and agent CRUD."""

from __future__ import annotations

import json
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from DAO.db import rls_connection
from DAO.deps import current_user_id
from DAO.exceptions import NotFoundError, ValidationError
from DAO.org import service as org_service
from DAO.org.catalog import catalog_payload, list_templates, template_payload

router = APIRouter(prefix="/spaces/{space_id}/org", tags=["org"])


class AgentCreate(BaseModel):
    name: str
    role: str
    department: str
    agent_type: str = "worker"
    model_tier: int = Field(default=2, ge=1, le=3)
    system_instruction: str = ""
    tool_allowlist: list[str] = Field(default_factory=list)
    parent_agent_id: UUID | None = None


class AgentUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    department: str | None = None
    system_instruction: str | None = None
    model_tier: int | None = None
    tool_allowlist: list[str] | None = None
    parent_agent_id: UUID | None = None


class OrgConfigUpdate(BaseModel):
    template_id: str = "custom"
    departments: list[str] = Field(default_factory=list)


class ApplyTemplateBody(BaseModel):
    template_id: str
    replace: bool = False
    departments: list[str] | None = None


class SuggestBody(BaseModel):
    mission: str | None = None
    space_name: str | None = None


@router.get("/departments")
async def get_departments(space_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        return await org_service.get_departments_view(conn, space_id)


@router.get("/templates")
async def get_templates(space_id: UUID, request: Request):
    _ = space_id
    _ = request
    return {"templates": list_templates(), "catalog": catalog_payload()}


@router.post("/templates/apply")
async def apply_template(space_id: UUID, body: ApplyTemplateBody, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        row = await conn.fetchrow(
            "SELECT ai_lead_config FROM spaces WHERE id = $1",
            space_id,
        )
        if not row:
            raise NotFoundError("Space not found")
        cfg = row["ai_lead_config"]
        if isinstance(cfg, str):
            cfg = json.loads(cfg)
        ai_lead_name = (cfg or {}).get("name") or "Jarvis"
        try:
            return await org_service.apply_template(
                conn,
                space_id,
                body.template_id,
                ai_lead_name,
                replace=body.replace,
                custom_departments=body.departments,
            )
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc


@router.put("/config")
async def update_org_config(space_id: UUID, body: OrgConfigUpdate, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        try:
            saved = await org_service.save_org_config(
                conn,
                space_id,
                {"template_id": body.template_id, "departments": body.departments},
            )
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc
        return {"ok": True, **saved, "departments": org_service.departments_payload(saved["departments"])}


@router.post("/suggest")
async def suggest_org(space_id: UUID, body: SuggestBody, request: Request):
    _ = request
    mission = body.mission
    space_name = body.space_name
    if not mission or not space_name:
        async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
            row = await conn.fetchrow(
                "SELECT name, ai_lead_config FROM spaces WHERE id = $1",
                space_id,
            )
            if row:
                cfg = row["ai_lead_config"]
                if isinstance(cfg, str):
                    cfg = json.loads(cfg)
                mission = mission or (cfg or {}).get("mission")
                space_name = space_name or row["name"]
    return org_service.suggest_org(mission=mission, space_name=space_name)


@router.get("/agents")
async def list_agents(space_id: UUID, request: Request, department: str | None = None):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        if department:
            rows = await conn.fetch(
                "SELECT * FROM agents WHERE space_id = $1 AND department = $2 ORDER BY agent_type, name",
                space_id,
                department,
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM agents WHERE space_id = $1 ORDER BY department, agent_type, name",
                space_id,
            )
    return {"agents": [dict(r) for r in rows]}


@router.post("/agents", status_code=201)
async def create_agent(space_id: UUID, body: AgentCreate, request: Request):
    dept = body.department.strip().lower()
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        cfg = await org_service.get_org_config_row(conn, space_id)
        allowed = set(cfg["departments"]) | {"executive"}
        if dept not in allowed:
            raise ValidationError(f"Department '{dept}' is not enabled for this Space")

        aid = await conn.fetchval(
            """
            INSERT INTO agents (
                space_id, name, role, department, agent_type, model_tier,
                system_instruction, tool_allowlist, parent_agent_id
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) RETURNING id
            """,
            space_id,
            body.name,
            body.role,
            dept,
            body.agent_type,
            body.model_tier,
            body.system_instruction,
            json.dumps(body.tool_allowlist),
            body.parent_agent_id,
        )
        await org_service.upsert_supervises_edge(conn, space_id, body.parent_agent_id, aid)
    return {"id": str(aid)}


@router.patch("/agents/{agent_id}")
async def update_agent(space_id: UUID, agent_id: UUID, body: AgentUpdate, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        row = await conn.fetchrow(
            "SELECT id, parent_agent_id FROM agents WHERE space_id = $1 AND id = $2",
            space_id,
            agent_id,
        )
        if not row:
            raise NotFoundError("Agent not found")

        if body.department is not None:
            dept = body.department.strip().lower()
            cfg = await org_service.get_org_config_row(conn, space_id)
            allowed = set(cfg["departments"]) | {"executive"}
            if dept not in allowed:
                raise ValidationError(f"Department '{dept}' is not enabled for this Space")

        await conn.execute(
            """
            UPDATE agents SET
              name = COALESCE($3, name),
              role = COALESCE($4, role),
              department = COALESCE($5, department),
              system_instruction = COALESCE($6, system_instruction),
              model_tier = COALESCE($7, model_tier),
              tool_allowlist = COALESCE($8::jsonb, tool_allowlist),
              parent_agent_id = COALESCE($9, parent_agent_id)
            WHERE id = $2 AND space_id = $1
            """,
            space_id,
            agent_id,
            body.name,
            body.role,
            body.department.strip().lower() if body.department else None,
            body.system_instruction,
            body.model_tier,
            json.dumps(body.tool_allowlist) if body.tool_allowlist is not None else None,
            body.parent_agent_id,
        )
        if body.parent_agent_id is not None:
            await org_service.upsert_supervises_edge(conn, space_id, body.parent_agent_id, agent_id)
    return {"ok": True}


@router.get("/chart")
async def org_chart(space_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        agents = await conn.fetch("SELECT * FROM agents WHERE space_id = $1", space_id)
        edges = await conn.fetch("SELECT * FROM org_edges WHERE space_id = $1", space_id)
        dept_view = await org_service.get_departments_view(conn, space_id)

    agent_list = [dict(a) for a in agents]
    nodes = org_service.chart_nodes_from_agents(agent_list)
    links = [
        {
            "from": str(e["from_agent_id"]),
            "to": str(e["to_agent_id"]),
            "type": e["edge_type"],
        }
        for e in edges
    ]
    if not links:
        links = org_service.chart_edges_from_agents(agent_list)

    return {
        "nodes": nodes,
        "edges": links,
        "departments": dept_view["departments"],
        "template_id": dept_view["template_id"],
    }
