"""Sync DAO Jarvis automations into Hermes cron jobs.json (create_job API)."""

from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID

from DAO.config import DAO_enabled, automation_cron_sync_enabled
from DAO.cron.home import cron_jobs_home
from DAO.db import admin_connection
from DAO.jarvis.automations import automation_prompt, automations_from_config, ensure_automations_seeded
from DAO.jarvis.supervisor import DEPT_TOOLSETS

_log = logging.getLogger(__name__)


def DAO_job_meta(job: dict[str, Any]) -> dict[str, Any] | None:
    """Return ``origin.DAO`` metadata when *job* is a DAO automation cron job."""
    origin = job.get("origin")
    if not isinstance(origin, dict):
        return None
    DAO = origin.get("DAO")
    if not isinstance(DAO, dict):
        return None
    if not DAO.get("space_id") or not DAO.get("automation_slug"):
        return None
    return DAO


def is_DAO_automation_job(job: dict[str, Any]) -> bool:
    return DAO_job_meta(job) is not None


def find_automation_job(space_id: UUID, slug: str) -> dict[str, Any] | None:
    """Locate a synced automation job by Space + slug (Hermes jobs.json scan)."""
    from cron.jobs import load_jobs

    sid = str(space_id)
    for job in load_jobs():
        meta = DAO_job_meta(job)
        if meta and meta.get("space_id") == sid and meta.get("automation_slug") == slug:
            return job
    return None

def _resolve_context_from(space_id: UUID, slugs: list[str]) -> list[str] | None:
    job_ids: list[str] = []
    for slug in slugs:
        text = str(slug or "").strip()
        if not text:
            continue
        dep = find_automation_job(space_id, text)
        if dep and dep.get("id"):
            job_ids.append(str(dep["id"]))
    return job_ids or None


def automation_to_job_kwargs(
    automation_row: dict[str, Any],
    *,
    space_id: UUID,
    owner_id: UUID,
    tier: str,
) -> dict[str, Any]:
    """Build ``cron.jobs.create_job`` kwargs — same pattern as ``blueprint_to_job_spec``."""
    slug = str(automation_row.get("slug") or "")
    department = automation_row.get("department")
    action = automation_row.get("action")
    cron_expr = str(automation_row.get("cron") or "0 9 * * *")
    deliver = str(automation_row.get("deliver") or "local")

    context_slugs = automation_row.get("context_from_slugs")
    context_from = None
    if isinstance(context_slugs, list) and context_slugs:
        context_from = _resolve_context_from(space_id, [str(s) for s in context_slugs])

    toolsets = automation_row.get("enabled_toolsets")
    if not toolsets and department:
        toolsets = DEPT_TOOLSETS.get(str(department))

    kwargs: dict[str, Any] = {
        "prompt": automation_prompt(automation_row),
        "schedule": cron_expr,
        "name": f"[DAO] {automation_row.get('name') or slug}",
        "deliver": deliver,
        "enabled_toolsets": toolsets,
        "origin": {
            "DAO": {
                "space_id": str(space_id),
                "automation_slug": slug,
                "automation_id": str(automation_row.get("id") or ""),
                "user_id": str(owner_id),
                "tier": tier,
                "action": str(action) if action else None,
                "department": department,
            }
        },
    }
    if context_from:
        kwargs["context_from"] = context_from
    return kwargs


def _prune_orphan_automation_jobs(space_id: UUID, active_slugs: set[str]) -> int:
    from cron.jobs import load_jobs, remove_job

    removed = 0
    sid = str(space_id)
    for job in list(load_jobs()):
        meta = DAO_job_meta(job)
        if not meta or meta.get("space_id") != sid:
            continue
        slug = str(meta.get("automation_slug") or "")
        if slug not in active_slugs:
            if remove_job(job["id"]):
                removed += 1
    return removed


def _upsert_automation_job(
    *,
    space_id: UUID,
    owner_id: UUID,
    tier: str,
    automation_row: dict[str, Any],
) -> None:
    from cron.jobs import create_job, pause_job, resume_job, update_job

    slug = str(automation_row.get("slug") or "")
    if not slug:
        return

    enabled = bool(automation_row.get("enabled", True))
    kwargs = automation_to_job_kwargs(
        automation_row,
        space_id=space_id,
        owner_id=owner_id,
        tier=tier,
    )
    existing = find_automation_job(space_id, slug)

    if existing:
        job_id = existing["id"]
        update_job(
            job_id,
            {
                "name": kwargs["name"],
                "prompt": kwargs["prompt"],
                "schedule": kwargs["schedule"],
                "deliver": kwargs["deliver"],
                "origin": kwargs["origin"],
                "enabled_toolsets": kwargs["enabled_toolsets"],
                "context_from": kwargs.get("context_from"),
            },
        )
        if enabled and not existing.get("enabled", True):
            resume_job(job_id)
        elif not enabled and existing.get("enabled", True):
            pause_job(job_id, reason="DAO automation disabled")
        return

    job = create_job(**kwargs)
    if not enabled:
        pause_job(job["id"], reason="DAO automation disabled")


async def _space_owner_and_tier(conn, space_id: UUID) -> tuple[UUID | None, str]:
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


async def sync_space_automations_to_cron(
    space_id: UUID,
    *,
    owner_id: UUID | None = None,
    tier: str | None = None,
) -> int:
    """Upsert Hermes cron jobs for all Space automations. Returns job count."""
    if not DAO_enabled() or not automation_cron_sync_enabled():
        return 0

    async with admin_connection() as conn:
        if owner_id is None or tier is None:
            resolved_owner, resolved_tier = await _space_owner_and_tier(conn, space_id)
            owner_id = owner_id or resolved_owner
            tier = tier or resolved_tier
        if owner_id is None:
            return 0
        await ensure_automations_seeded(conn, space_id)
        row = await conn.fetchrow(
            "SELECT ai_lead_config FROM spaces WHERE id = $1",
            space_id,
        )
        if row is None:
            return 0
        cfg = row["ai_lead_config"]
        if isinstance(cfg, str):
            cfg = json.loads(cfg)
        if not isinstance(cfg, dict):
            cfg = {}
        automations = automations_from_config(cfg)

    active_slugs = {str(a.get("slug")) for a in automations if a.get("slug")}
    with cron_jobs_home(user_id=owner_id, space_id=space_id, tier=tier):
        for automation_row in automations:
            _upsert_automation_job(
                space_id=space_id,
                owner_id=owner_id,
                tier=tier,
                automation_row=automation_row,
            )
        for automation_row in automations:
            slug = str(automation_row.get("slug") or "")
            if not slug:
                continue
            job = find_automation_job(space_id, slug)
            if job is None:
                continue
            kwargs = automation_to_job_kwargs(
                automation_row,
                space_id=space_id,
                owner_id=owner_id,
                tier=tier,
            )
            if kwargs.get("context_from"):
                from cron.jobs import update_job

                update_job(job["id"], {"context_from": kwargs["context_from"]})
        pruned = _prune_orphan_automation_jobs(space_id, active_slugs)
        if pruned:
            _log.info("Pruned %s orphan DAO automation cron job(s) for space %s", pruned, space_id)

    _log.debug("Synced %s DAO automation cron jobs for space %s", len(automations), space_id)
    return len(automations)


async def reconcile_all_automation_cron_jobs() -> int:
    if not DAO_enabled() or not automation_cron_sync_enabled():
        return 0

    async with admin_connection() as conn:
        rows = await conn.fetch(
            """
            SELECT s.id, s.tier,
                   (
                     SELECT user_id FROM space_members
                     WHERE space_id = s.id AND role = 'owner'
                     ORDER BY created_at ASC
                     LIMIT 1
                   ) AS owner_id
            FROM spaces s
            ORDER BY s.created_at ASC
            """
        )

    total = 0
    for row in rows:
        owner_id = row["owner_id"]
        if owner_id is None:
            continue
        total += await sync_space_automations_to_cron(
            row["id"],
            owner_id=owner_id,
            tier=str(row["tier"] or "solo"),
        )
    if total:
        _log.info("Reconciled DAO automation cron jobs (%s rows)", total)
    return total
