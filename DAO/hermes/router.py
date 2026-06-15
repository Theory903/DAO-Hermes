"""REST routes for Hermes agent setup (CLI parity in DAO web UI)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from DAO.hermes import service as hermes
from DAO.hermes.proxy import router as hermes_proxy_router

router = APIRouter(tags=["hermes"])
router.include_router(hermes_proxy_router)


class RawConfigBody(BaseModel):
    yaml: str = Field(..., alias="yaml_text")

    model_config = {"populate_by_name": True}


class SetModelBody(BaseModel):
    model: str
    provider: str = ""
    base_url: str = ""


class SkillToggleBody(BaseModel):
    name: str
    enabled: bool


@router.get("/spaces/{space_id}/hermes/runtime")
async def hermes_runtime(_space_id: UUID):
    return hermes.runtime_summary()


@router.get("/spaces/{space_id}/hermes/catalog")
async def hermes_catalog(_space_id: UUID):
    return {"areas": hermes.get_cli_catalog()}


@router.get("/spaces/{space_id}/hermes/status")
async def hermes_status(_space_id: UUID):
    return hermes.get_status()


@router.get("/spaces/{space_id}/hermes/config")
async def hermes_config(_space_id: UUID):
    return hermes.get_config()


@router.get("/spaces/{space_id}/hermes/config/raw")
async def hermes_config_raw(_space_id: UUID):
    return hermes.get_config_raw()


@router.put("/spaces/{space_id}/hermes/config/raw")
async def hermes_config_raw_update(_space_id: UUID, body: RawConfigBody):
    try:
        hermes.save_config_raw(body.yaml)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"ok": True}


@router.get("/spaces/{space_id}/hermes/model")
async def hermes_model(_space_id: UUID):
    return hermes.get_model_info()


@router.post("/spaces/{space_id}/hermes/model")
async def hermes_model_set(_space_id: UUID, body: SetModelBody):
    try:
        return hermes.set_main_model(
            model=body.model,
            provider=body.provider,
            base_url=body.base_url,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/spaces/{space_id}/hermes/skills")
async def hermes_skills(_space_id: UUID):
    return hermes.list_skills()


@router.put("/spaces/{space_id}/hermes/skills/toggle")
async def hermes_skill_toggle(_space_id: UUID, body: SkillToggleBody):
    return hermes.toggle_skill(body.name, body.enabled)


@router.get("/spaces/{space_id}/hermes/sessions")
async def hermes_sessions(
    _space_id: UUID,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    return hermes.list_sessions(limit=limit, offset=offset)


@router.get("/spaces/{space_id}/hermes/cron")
async def hermes_cron(space_id: UUID):
    from DAO.cron.home import cron_jobs_home
    from DAO.cron.status import hermes_job_public_fields
    from DAO.cron.sync import DAO_job_meta
    from DAO.db import admin_connection

    jobs = hermes.list_cron_jobs()
    async with admin_connection() as conn:
        row = await conn.fetchrow(
            """
            SELECT (
              SELECT user_id FROM space_members
              WHERE space_id = s.id AND role = 'owner'
              ORDER BY created_at ASC LIMIT 1
            ) AS owner_id, s.tier
            FROM spaces s WHERE s.id = $1
            """,
            space_id,
        )
    if row and row["owner_id"]:
        with cron_jobs_home(
            user_id=row["owner_id"],
            space_id=space_id,
            tier=str(row["tier"] or "solo"),
        ):
            from cron.jobs import load_jobs

            jobs = load_jobs()

    DAO_jobs = []
    for job in jobs:
        meta = DAO_job_meta(job)
        if meta and meta.get("space_id") == str(space_id):
            entry = hermes_job_public_fields(job)
            entry["automation_slug"] = meta.get("automation_slug")
            entry["name"] = job.get("name")
            DAO_jobs.append(entry)
    return {"jobs": jobs, "DAO_automations": DAO_jobs}


@router.get("/spaces/{space_id}/hermes/mcp")
async def hermes_mcp(_space_id: UUID):
    return {"servers": hermes.list_mcp_servers()}
