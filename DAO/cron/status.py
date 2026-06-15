"""Hermes cron runtime fields merged into DAO automation API responses."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from DAO.cron.home import cron_jobs_home
from DAO.cron.sync import DAO_job_meta, find_automation_job


def hermes_job_public_fields(job: dict[str, Any] | None) -> dict[str, Any]:
    """Subset of a Hermes cron job safe for Automations UI / API."""
    if job is None:
        return {
            "cron_job_id": None,
            "schedule_display": None,
            "next_run_at": None,
            "last_run_at": None,
            "last_status": None,
            "last_error": None,
            "last_delivery_error": None,
            "state": None,
            "cron_enabled": None,
            "paused_reason": None,
        }
    schedule = job.get("schedule")
    schedule_display = job.get("schedule_display")
    if not schedule_display and isinstance(schedule, dict):
        schedule_display = schedule.get("display") or schedule.get("expr")
    return {
        "cron_job_id": job.get("id"),
        "schedule_display": schedule_display,
        "next_run_at": job.get("next_run_at"),
        "last_run_at": job.get("last_run_at"),
        "last_status": job.get("last_status"),
        "last_error": job.get("last_error"),
        "last_delivery_error": job.get("last_delivery_error"),
        "state": job.get("state"),
        "cron_enabled": job.get("enabled", True),
        "paused_reason": job.get("paused_reason"),
        "context_from": job.get("context_from"),
        "deliver": job.get("deliver"),
    }


def enrich_automation_row(
    automation_row: dict[str, Any],
    *,
    space_id: UUID,
    job: dict[str, Any] | None,
) -> dict[str, Any]:
    """Overlay Hermes job runtime onto an automation row."""
    row = dict(automation_row)
    row.update(hermes_job_public_fields(job))
    if job is not None:
        meta = DAO_job_meta(job) or {}
        row["department"] = meta.get("department") or row.get("department")
        row["action"] = meta.get("action")
    row["space_id"] = str(space_id)
    return row


def enrich_automations(
    automations: list[dict[str, Any]],
    *,
    space_id: UUID,
    owner_id: UUID,
    tier: str,
) -> list[dict[str, Any]]:
    """Attach live Hermes cron status for each automation slug."""
    with cron_jobs_home(user_id=owner_id, space_id=space_id, tier=tier):
        out: list[dict[str, Any]] = []
        for automation_row in automations:
            slug = str(automation_row.get("slug") or "")
            job = find_automation_job(space_id, slug) if slug else None
            out.append(
                enrich_automation_row(automation_row, space_id=space_id, job=job)
            )
        return out
