"""Hermes cron scheduler hooks for DAO automation jobs."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from DAO.comms import events as event_bus
from DAO.config import DAO_enabled
from DAO.cron.sync import DAO_job_meta
from DAO.db import rls_standalone, run_sync
from DAO.gateway_runtime import bind_dao_runtime_from_meta
from DAO.hooks.prompt_supervisor import apply_DAO_supervisor_routing
from DAO.jarvis import briefing as briefing_svc
from DAO.jarvis.automations import find_automation, normalize_automation, save_automations_rls
from DAO.runtime import HermesBindHandle, unbind_hermes_runtime

_log = logging.getLogger(__name__)
_SILENT_MARKER = "[SILENT]"


def _automation_slug(meta: dict[str, Any]) -> str:
    return str(meta.get("automation_slug") or "")


def DAO_run_job_begin(job: dict[str, Any]) -> tuple[dict[str, Any] | None, HermesBindHandle | None]:
    """Bind Space runtime when a DAO automation cron job is about to run."""
    if not DAO_enabled():
        return None, None
    meta = DAO_job_meta(job)
    if meta is None:
        return None, None
    try:
        handle = bind_dao_runtime_from_meta(meta)
        if handle is None:
            return None, None
        slug = _automation_slug(meta)
        space_id = UUID(str(meta["space_id"]))
        try:
            run_sync(
                event_bus.publish(
                    space_id,
                    "automation_started",
                    {
                        "automation": slug,
                        "cron_job_id": job.get("id"),
                        "department": meta.get("department"),
                    },
                )
            )
        except Exception as exc:
            _log.debug("automation_started publish skipped: %s", exc)
        return meta, handle
    except Exception as exc:
        _log.warning("DAO cron bind failed for job %s: %s", job.get("id"), exc)
        return None, None


def DAO_run_job_end(handle: HermesBindHandle | None) -> None:
    if handle is not None:
        unbind_hermes_runtime(handle)


def try_run_DAO_briefing_job(
    job: dict[str, Any],
    meta: dict[str, Any],
) -> tuple[bool, str, str, str | None] | None:
    """Run briefing automations without invoking the LLM agent."""
    if meta.get("action") != "briefing":
        return None

    space_id = UUID(str(meta["space_id"]))
    user_id = UUID(str(meta["user_id"]))
    slug = _automation_slug(meta) or "morning-briefing"
    job_name = str(job.get("name") or slug)

    try:
        briefing = run_sync(_run_briefing(space_id, user_id))
        run_sync(
            _persist_automation_run(
                space_id,
                user_id,
                slug,
                success=True,
                cron_job_id=job.get("id"),
            )
        )
        route = {
            "automation": slug,
            "department": meta.get("department"),
            "briefing": briefing,
        }
        run_sync(event_bus.publish(space_id, "automation_triggered", route))
    except Exception as exc:
        _log.warning("DAO briefing automation failed for %s: %s", space_id, exc)
        run_sync(
            _persist_automation_run(
                space_id,
                user_id,
                slug,
                success=False,
                error=str(exc),
                cron_job_id=job.get("id"),
            )
        )
        return False, "", "", str(exc)

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    markdown = str(briefing.get("markdown") or "")
    doc = (
        f"# DAO Automation: {job_name}\n\n"
        f"**Job ID:** {job['id']}\n"
        f"**Run Time:** {now_iso}\n"
        f"**Status:** briefing completed\n\n"
        f"{markdown}\n"
    )
    return True, doc, _SILENT_MARKER, None


def enrich_DAO_automation_prompt(job: dict[str, Any], prompt: str) -> str:
    """Supervisor routing + Command Center event for agent-backed automations."""
    if not DAO_enabled():
        return prompt
    meta = DAO_job_meta(job)
    if meta is None:
        return prompt

    slug = _automation_slug(meta)
    space_id = UUID(str(meta["space_id"]))
    user_id = UUID(str(meta["user_id"]))
    mission = run_sync(_load_mission(space_id, user_id))

    enriched, payload = apply_DAO_supervisor_routing(prompt, mission=mission)
    if payload:
        payload = dict(payload)
        payload["automation"] = slug
        payload["cron_job_id"] = job.get("id")
        try:
            run_sync(event_bus.publish(space_id, "automation_triggered", payload))
        except Exception as exc:
            _log.debug("automation_triggered publish skipped: %s", exc)
    return enriched


def DAO_after_job_run(job: dict[str, Any], success: bool, error: str | None = None) -> None:
    """Mirror automation runs into ai_lead_config + Command Center SSE."""
    meta = DAO_job_meta(job)
    if meta is None:
        return
    space_id = UUID(str(meta["space_id"]))
    user_id = UUID(str(meta["user_id"]))
    slug = _automation_slug(meta)
    try:
        run_sync(
            _persist_automation_run(
                space_id,
                user_id,
                slug,
                success=success,
                error=error or job.get("last_error"),
                cron_job_id=job.get("id"),
            )
        )
        event_type = "automation_completed" if success else "automation_failed"
        run_sync(
            event_bus.publish(
                space_id,
                event_type,
                {
                    "automation": slug,
                    "cron_job_id": job.get("id"),
                    "success": success,
                    "error": error or job.get("last_error"),
                },
            )
        )
    except Exception as exc:
        _log.debug("DAO automation after-run sync skipped: %s", exc)


async def _run_briefing(space_id: UUID, user_id: UUID) -> dict[str, Any]:
    async with rls_standalone(space_id=space_id, user_id=user_id) as conn:
        result = await briefing_svc.generate_and_store_briefing(
            conn, space_id, trigger_source="cron"
        )
    return {"space_id": str(space_id), "status": "completed", **result}


async def _load_mission(space_id: UUID, user_id: UUID) -> str:
    async with rls_standalone(space_id=space_id, user_id=user_id) as conn:
        raw = await conn.fetchval(
            "SELECT ai_lead_config FROM spaces WHERE id = $1",
            space_id,
        )
    if isinstance(raw, str):
        cfg = json.loads(raw)
    elif isinstance(raw, dict):
        cfg = raw
    else:
        cfg = {}
    return str(cfg.get("mission") or "").strip()


async def _persist_automation_run(
    space_id: UUID,
    user_id: UUID,
    slug: str,
    *,
    success: bool,
    error: str | None = None,
    cron_job_id: str | None = None,
) -> None:
    from DAO.jarvis.automations import automations_from_config

    async with rls_standalone(space_id=space_id, user_id=user_id) as conn:
        raw = await conn.fetchval(
            "SELECT ai_lead_config FROM spaces WHERE id = $1",
            space_id,
        )
        if isinstance(raw, str):
            cfg = json.loads(raw)
        elif isinstance(raw, dict):
            cfg = dict(raw)
        else:
            cfg = {}
        automations = automations_from_config(cfg)
        stamp = datetime.now(timezone.utc).isoformat()
        status = "ok" if success else "error"
        target = find_automation(automations, slug)
        if target is None:
            target = normalize_automation({"slug": slug, "name": slug})
            automations.append(target)
        target["last_run_at"] = stamp
        target["last_status"] = status
        target["last_error"] = None if success else (error or "unknown error")
        if cron_job_id:
            target["cron_job_id"] = cron_job_id
        await save_automations_rls(conn, space_id, automations)
