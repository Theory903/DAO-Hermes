"""Automation runs — Hermes cron jobs synced from Space automations."""

from __future__ import annotations

import json
import logging
from uuid import UUID

from DAO.cron.home import cron_jobs_home
from DAO.cron.sync import find_automation_job, sync_space_automations_to_cron
from DAO.db import admin_connection, rls_connection
from DAO.jarvis.automations import automations_from_config, find_automation

_log = logging.getLogger(__name__)


async def _space_owner_and_tier(space_id: UUID) -> tuple[UUID | None, str]:
    async with admin_connection() as conn:
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


async def trigger_automation(
    space_id: UUID,
    slug: str,
    *,
    user_id: UUID | None = None,
    manual: bool = False,
) -> dict:
    """Sync automation → Hermes cron job, then run via ``cron.scheduler.run_job``."""
    owner_id, tier = await _space_owner_and_tier(space_id)
    if owner_id is None:
        raise ValueError("No space owner for automation run")
    actor_id = user_id or owner_id

    async with rls_connection(space_id=space_id, user_id=actor_id) as conn:
        raw = await conn.fetchval(
            "SELECT ai_lead_config FROM spaces WHERE id = $1",
            space_id,
        )
        cfg = json.loads(raw) if isinstance(raw, str) else (raw or {})
        automations = automations_from_config(cfg)
        row = find_automation(automations, slug)
        if row is None:
            raise KeyError(f"Unknown automation: {slug}")
        if not manual and not row.get("enabled", True):
            return {"slug": slug, "status": "skipped", "reason": "disabled"}

    await sync_space_automations_to_cron(space_id, owner_id=owner_id, tier=tier)

    def _run_hermes_cron_job() -> dict:
        from cron.scheduler import run_job

        with cron_jobs_home(user_id=owner_id, space_id=space_id, tier=tier):
            job = find_automation_job(space_id, slug)
            if job is None:
                raise KeyError(f"DAO automation cron job missing: {slug}")
            success, _output, final_response, error = run_job(job)
            result: dict = {
                "slug": slug,
                "status": "completed" if success else "error",
                "cron_job_id": job.get("id"),
            }
            if error:
                result["error"] = error
            if final_response:
                result["agent_response"] = final_response
            return result

    import asyncio

    result = await asyncio.to_thread(_run_hermes_cron_job)
    result["manual"] = manual
    _log.info(
        "automation %s %s for space %s (Hermes cron job %s)",
        slug,
        "triggered manually" if manual else "ran on schedule",
        space_id,
        result.get("cron_job_id"),
    )
    return result
