"""Space-scoped automations — user/agent-defined schedules synced to Hermes cron."""

from __future__ import annotations

import json
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

try:
    from croniter import croniter
except ImportError:  # pragma: no cover
    croniter = None  # type: ignore

from DAO.jarvis.supervisor import DEPT_TOOLSETS

# Optional onboarding seeds — copied once per Space, then fully editable.
STARTER_TEMPLATES: list[dict[str, Any]] = [
    {
        "slug": "morning-briefing",
        "name": "Morning Briefing",
        "cron": "0 7 * * *",
        "action": "briefing",
        "prompt": (
            "Run the morning briefing: summarize overnight Drive activity, "
            "Brain entities, pending HITL, and department handoffs."
        ),
    },
    {
        "slug": "research-scan",
        "name": "Research Scan",
        "cron": "0 9 * * 1-5",
        "department": "research",
        "context_from_slugs": ["dream-prep"],
        "prompt": (
            "Competitor research scan: identify intel gaps, reuse Research Memory, "
            "delegate fresh research only for gaps."
        ),
    },
    {
        "slug": "content-pipeline",
        "name": "Content Pipeline",
        "cron": "0 10 * * *",
        "department": "marketing",
        "prompt": (
            "Review draft content in Drive, propose today's publish queue, "
            "delegate copy or SEO tasks to Marketing."
        ),
    },
    {
        "slug": "sales-outreach",
        "name": "Sales Outreach",
        "cron": "0 11 * * 1-5",
        "department": "sales",
        "prompt": (
            "Summarize pipeline follow-ups due today and delegate "
            "personalized outreach drafts to Sales."
        ),
    },
    {
        "slug": "ops-health",
        "name": "Ops Health Check",
        "cron": "0 */6 * * *",
        "department": "ops",
        "prompt": (
            "Review monitors, incidents, and deploy status; escalate anomalies."
        ),
    },
    {
        "slug": "dream-prep",
        "name": "Dream Cycle Prep",
        "cron": "0 1 * * *",
        "department": "research",
        "prompt": (
            "Review today's sessions and Drive artifacts. For each durable insight "
            "(competitor, decision, metric, process), call DAO_store_knowledge with "
            "a clear title and compiled markdown. Skip ephemeral chat or raw tool dumps."
        ),
    },
]


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:64] or secrets.token_hex(4)


def unique_slug(name: str, existing: set[str]) -> str:
    base = _slugify(name)
    if base not in existing:
        return base
    for i in range(2, 100):
        candidate = f"{base}-{i}"
        if candidate not in existing:
            return candidate
    return f"{base}-{secrets.token_hex(3)}"


def automations_from_config(cfg: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Load automations from Space ``ai_lead_config.automations``."""
    if not cfg:
        return []
    raw = cfg.get("automations")
    if not isinstance(raw, list):
        return []
    return [normalize_automation(row) for row in raw if isinstance(row, dict)]


def normalize_automation(row: dict[str, Any]) -> dict[str, Any]:
    """Canonical automation row for API, DB, and Hermes sync."""
    slug = str(row.get("slug") or "").strip()
    name = str(row.get("name") or slug or "Automation").strip()
    out: dict[str, Any] = {
        "id": str(row.get("id") or uuid4()),
        "slug": slug or _slugify(name),
        "name": name,
        "enabled": bool(row.get("enabled", True)),
        "cron": str(row.get("cron") or "0 9 * * *"),
        "prompt": str(row.get("prompt") or f"Run scheduled automation: {name}"),
        "deliver": str(row.get("deliver") or "local"),
    }
    for key in (
        "department",
        "action",
        "context_from_slugs",
        "enabled_toolsets",
        "created_at",
        "created_by",
        "last_run_at",
        "last_status",
        "last_error",
        "cron_job_id",
    ):
        if row.get(key) is not None:
            out[key] = row[key]
    if out.get("department") and not out.get("enabled_toolsets"):
        dept = str(out["department"])
        if dept in DEPT_TOOLSETS:
            out.setdefault("enabled_toolsets", DEPT_TOOLSETS[dept])
    return out


def find_automation(rows: list[dict[str, Any]], slug: str) -> dict[str, Any] | None:
    for row in rows:
        if row.get("slug") == slug:
            return row
    return None


def automation_prompt(row: dict[str, Any]) -> str:
    return str(row.get("prompt") or f"Run automation: {row.get('name', row.get('slug'))}")


def validate_schedule(schedule: str) -> str:
    from cron.jobs import parse_schedule

    parsed = parse_schedule(schedule.strip())
    if parsed.get("kind") == "cron":
        return str(parsed["expr"])
    return schedule.strip()


def starter_templates() -> list[dict[str, Any]]:
    """Templates the agent/user can adopt — not enforced after seed."""
    return [normalize_automation({**t, "created_by": "seed"}) for t in STARTER_TEMPLATES]


def _parse_last_run(raw: Any) -> datetime | None:
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    if isinstance(raw, str) and raw.strip():
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def is_automation_due(
    automation: dict[str, Any],
    now: datetime | None = None,
) -> bool:
    """True when cron schedule has elapsed since last_run_at (or never run)."""
    if not automation.get("enabled", True):
        return False
    cron_expr = automation.get("cron")
    if not cron_expr or croniter is None:
        return False

    now = now or datetime.now(timezone.utc)
    last_run = _parse_last_run(automation.get("last_run_at"))
    base = last_run or (now - timedelta(days=2))
    try:
        itr = croniter(str(cron_expr), base)
        next_run = itr.get_next(datetime)
    except (ValueError, KeyError):
        return False

    if next_run.tzinfo is None:
        next_run = next_run.replace(tzinfo=timezone.utc)
    if next_run > now:
        return False

    if last_run is not None:
        delta = (now - last_run).total_seconds()
        if delta < 55:
            return False
    return True


async def load_automations_rls(conn, space_id: UUID) -> list[dict[str, Any]]:
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
    return automations_from_config(cfg)


async def save_automations_rls(
    conn,
    space_id: UUID,
    automations: list[dict[str, Any]],
) -> None:
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
    normalized = [normalize_automation(a) for a in automations]
    cfg["automations"] = normalized
    await conn.execute(
        "UPDATE spaces SET ai_lead_config = $2::jsonb WHERE id = $1",
        space_id,
        json.dumps(cfg),
    )


async def ensure_automations_seeded(conn, space_id: UUID) -> bool:
    """Seed starter templates when a Space has no automations yet."""
    rows = await load_automations_rls(conn, space_id)
    if rows:
        return False
    await save_automations_rls(conn, space_id, starter_templates())
    return True
