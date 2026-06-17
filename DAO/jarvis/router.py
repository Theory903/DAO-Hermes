"""AI Lead config, automations, briefing."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from DAO.cron.status import enrich_automations
from DAO.db import rls_connection
from DAO.deps import current_user_id, require_space_role
from DAO.exceptions import NotFoundError
from DAO.jarvis import briefing as briefing_svc
from DAO.jarvis.home_greeting import attach_home_greeting as _attach_home_greeting
from DAO.jarvis.automation_service import (
    adopt_template,
    create_automation,
    delete_automation,
    list_automations,
    run_automation,
    update_automation,
)
from DAO.jarvis.automations import starter_templates
from DAO.jarvis.supervisor import Supervisor, routing_payload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/spaces/{space_id}/jarvis", tags=["jarvis"])


class JarvisConfigPatch(BaseModel):
    name: str | None = None
    persona: str | None = None
    hitl_policy: dict | None = None
    default_model_tier: int | None = None
    mission: str | None = None


class AutomationCreate(BaseModel):
    name: str
    cron: str = Field(description="Hermes schedule: cron, every 30m, or ISO one-shot")
    prompt: str
    slug: str | None = None
    enabled: bool = True
    department: str | None = None
    action: str | None = Field(None, description="briefing = no-LLM briefing worker")
    deliver: str | None = "local"
    context_from_slugs: list[str] | None = None
    enabled_toolsets: list[str] | None = None


class AutomationPatch(BaseModel):
    name: str | None = None
    enabled: bool | None = None
    cron: str | None = Field(
        None,
        description="Hermes schedule: cron expr, 'every 30m', or ISO one-shot",
    )
    prompt: str | None = None
    deliver: str | None = None
    department: str | None = None
    action: str | None = None
    context_from_slugs: list[str] | None = None
    enabled_toolsets: list[str] | None = None


class RouteRequest(BaseModel):
    message: str
    mission: str = ""


async def _space_owner_tier(conn, space_id: UUID) -> tuple[UUID | None, str]:
    row = await conn.fetchrow(
        """
        SELECT s.tier,
               (
                 SELECT user_id FROM space_members
                 WHERE space_id = s.id AND role = 'owner'
                 ORDER BY created_at ASC
                 LIMIT 1
               ) AS owner_id
        FROM spaces s
        WHERE s.id = $1
        """,
        space_id,
    )
    if row is None:
        return None, "solo"
    return row["owner_id"], str(row["tier"] or "solo")


async def _enriched_list(conn, space_id: UUID) -> list[dict]:
    owner_id, tier = await _space_owner_tier(conn, space_id)
    rows = await list_automations(conn, space_id)
    if owner_id is None:
        return rows
    return enrich_automations(rows, space_id=space_id, owner_id=owner_id, tier=tier)


@router.post("/route")
async def route_user_message(space_id: UUID, body: RouteRequest, request: Request):
    _ = request
    state = Supervisor().run(user_message=body.message, mission=body.mission)
    return routing_payload(state)


@router.get("/config")
async def get_config(space_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        row = await conn.fetchrow(
            "SELECT ai_lead_config FROM spaces WHERE id = $1", space_id
        )
    if not row:
        raise NotFoundError("Space not found")
    cfg = row["ai_lead_config"]
    if isinstance(cfg, str):
        cfg = json.loads(cfg)
    return cfg


@router.patch("/config")
async def patch_config(space_id: UUID, body: JarvisConfigPatch, request: Request):
    require_space_role(request, "owner", "admin")
    user = request.state.user
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        row = await conn.fetchrow(
            "SELECT ai_lead_config FROM spaces WHERE id = $1", space_id
        )
        cfg = row["ai_lead_config"]
        if isinstance(cfg, str):
            cfg = json.loads(cfg)
        if body.name is not None:
            cfg["name"] = body.name
        if body.persona is not None:
            cfg["persona"] = body.persona
        if body.hitl_policy is not None:
            cfg["hitl_policy"] = body.hitl_policy
        if body.default_model_tier is not None:
            cfg["default_model_tier"] = body.default_model_tier
        if body.mission is not None:
            cfg["mission"] = body.mission
        await conn.execute(
            "UPDATE spaces SET ai_lead_config = $2::jsonb WHERE id = $1",
            space_id,
            json.dumps(cfg),
        )
        from DAO.audit import log_audit_event

        await log_audit_event(
            conn,
            space_id=space_id,
            actor=str(user.get("email") or user["id"]),
            action="jarvis.config.patch",
            resource=f"space:{space_id}",
            metadata={"fields": [k for k, v in body.model_dump().items() if v is not None]},
        )
    return cfg


@router.get("/automations/templates")
async def list_automation_templates(_space_id: UUID, request: Request):
    _ = request
    return {"templates": starter_templates()}


@router.get("/automations")
async def list_automations_route(space_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        automations = await _enriched_list(conn, space_id)
    return {"automations": automations}


@router.post("/automations", status_code=201)
async def create_automation_route(space_id: UUID, body: AutomationCreate, request: Request):
    require_space_role(request, "owner", "admin")
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        owner_id, tier = await _space_owner_tier(conn, space_id)
        if owner_id is None:
            raise HTTPException(status_code=400, detail="Space has no owner")
        try:
            row = await create_automation(
                conn,
                space_id,
                owner_id=owner_id,
                tier=tier,
                name=body.name,
                cron=body.cron,
                prompt=body.prompt,
                slug=body.slug,
                enabled=body.enabled,
                department=body.department,
                action=body.action,
                deliver=body.deliver,
                context_from_slugs=body.context_from_slugs,
                enabled_toolsets=body.enabled_toolsets,
                created_by="user",
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        automations = await _enriched_list(conn, space_id)
    return {"automation": row, "automations": automations}


@router.post("/automations/templates/{template_slug}/adopt", status_code=201)
async def adopt_automation_template(space_id: UUID, template_slug: str, request: Request):
    require_space_role(request, "owner", "admin")
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        owner_id, tier = await _space_owner_tier(conn, space_id)
        if owner_id is None:
            raise HTTPException(status_code=400, detail="Space has no owner")
        try:
            row = await adopt_template(
                conn,
                space_id,
                template_slug,
                owner_id=owner_id,
                tier=tier,
                created_by="user",
            )
        except KeyError:
            raise NotFoundError(f"Template not found: {template_slug}") from None
        automations = await _enriched_list(conn, space_id)
    return {"automation": row, "automations": automations}


@router.patch("/automations/{slug}")
async def patch_automation(space_id: UUID, slug: str, body: AutomationPatch, request: Request):
    require_space_role(request, "owner", "admin")
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        owner_id, tier = await _space_owner_tier(conn, space_id)
        if owner_id is None:
            raise HTTPException(status_code=400, detail="Space has no owner")
        patch = body.model_dump(exclude_none=True)
        try:
            await update_automation(
                conn,
                space_id,
                slug,
                owner_id=owner_id,
                tier=tier,
                patch=patch,
            )
        except KeyError:
            raise NotFoundError(f"Automation not found: {slug}") from None
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        automations = await _enriched_list(conn, space_id)
    return {"automations": automations}


@router.delete("/automations/{slug}")
async def remove_automation(space_id: UUID, slug: str, request: Request):
    require_space_role(request, "owner", "admin")
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        owner_id, tier = await _space_owner_tier(conn, space_id)
        if owner_id is None:
            raise HTTPException(status_code=400, detail="Space has no owner")
        ok = await delete_automation(
            conn, space_id, slug, owner_id=owner_id, tier=tier
        )
        if not ok:
            raise NotFoundError(f"Automation not found: {slug}")
        automations = await _enriched_list(conn, space_id)
    return {"deleted": slug, "automations": automations}


@router.post("/automations/{slug}/trigger")
async def trigger_automation_run(space_id: UUID, slug: str, request: Request):
    require_space_role(request, "owner", "admin", "member")
    uid = current_user_id(request)
    try:
        return await run_automation(space_id, slug, user_id=uid, manual=True)
    except KeyError:
        raise NotFoundError(f"Automation not found: {slug}") from None


@router.post("/briefing/trigger")
async def trigger_briefing(space_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        await briefing_svc.generate_and_store_briefing(conn, space_id, trigger_source="api")
    return {"triggered": True}


from DAO.jarvis.home_greeting import attach_home_greeting as _attach_home_greeting
async def briefing_history(space_id: UUID, request: Request, limit: int = 30):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        return {"briefings": await briefing_svc.list_briefings(conn, space_id, limit=limit)}


@router.get("/reports")
async def space_reports(space_id: UUID, request: Request, limit: int = 30):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        return await briefing_svc.fetch_reports_bundle(conn, space_id, limit=limit)


@router.get("/briefing/latest")
async def latest_briefing(space_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        latest = await briefing_svc.fetch_latest_briefing(conn, space_id)
        if not latest:
            latest = await briefing_svc.generate_and_store_briefing(conn, space_id, trigger_source="api")
        return await _attach_home_greeting(conn, space_id, request, latest)
