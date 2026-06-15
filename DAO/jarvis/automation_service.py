"""CRUD + Hermes cron sync for Space automations (API + agent tool)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from DAO.cron.sync import sync_space_automations_to_cron
from DAO.jarvis.automations import (
    automations_from_config,
    find_automation,
    normalize_automation,
    save_automations_rls,
    starter_templates,
    unique_slug,
    validate_schedule,
)
from DAO.workers.automation_cron import trigger_automation


async def list_automations(conn, space_id: UUID) -> list[dict[str, Any]]:
    from DAO.jarvis.automations import load_automations_rls

    return await load_automations_rls(conn, space_id)


async def create_automation(
    conn,
    space_id: UUID,
    *,
    owner_id: UUID,
    tier: str,
    name: str,
    cron: str,
    prompt: str,
    slug: str | None = None,
    enabled: bool = True,
    department: str | None = None,
    action: str | None = None,
    deliver: str | None = None,
    context_from_slugs: list[str] | None = None,
    enabled_toolsets: list[str] | None = None,
    created_by: str = "user",
) -> dict[str, Any]:
    validate_schedule(cron)
    rows = await list_automations(conn, space_id)
    slugs = {str(r.get("slug")) for r in rows}
    final_slug = slug.strip() if slug else unique_slug(name, slugs)
    if final_slug in slugs:
        raise ValueError(f"Automation slug already exists: {final_slug}")

    row = normalize_automation(
        {
            "slug": final_slug,
            "name": name,
            "cron": cron,
            "prompt": prompt,
            "enabled": enabled,
            "department": department,
            "action": action,
            "deliver": deliver or "local",
            "context_from_slugs": context_from_slugs,
            "enabled_toolsets": enabled_toolsets,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": created_by,
        }
    )
    rows.append(row)
    await save_automations_rls(conn, space_id, rows)
    await sync_space_automations_to_cron(space_id, owner_id=owner_id, tier=tier)
    return row


async def update_automation(
    conn,
    space_id: UUID,
    slug: str,
    *,
    owner_id: UUID,
    tier: str,
    patch: dict[str, Any],
) -> dict[str, Any]:
    rows = await list_automations(conn, space_id)
    target = find_automation(rows, slug)
    if target is None:
        raise KeyError(slug)

    if patch.get("cron") is not None:
        validate_schedule(str(patch["cron"]))
        target["cron"] = str(patch["cron"]).strip()
    for key in (
        "name",
        "prompt",
        "enabled",
        "department",
        "action",
        "deliver",
        "context_from_slugs",
        "enabled_toolsets",
    ):
        if key in patch and patch[key] is not None:
            target[key] = patch[key]

    await save_automations_rls(conn, space_id, rows)
    await sync_space_automations_to_cron(space_id, owner_id=owner_id, tier=tier)
    return normalize_automation(target)


async def delete_automation(
    conn,
    space_id: UUID,
    slug: str,
    *,
    owner_id: UUID,
    tier: str,
) -> bool:
    rows = await list_automations(conn, space_id)
    kept = [r for r in rows if r.get("slug") != slug]
    if len(kept) == len(rows):
        return False
    await save_automations_rls(conn, space_id, kept)
    await sync_space_automations_to_cron(space_id, owner_id=owner_id, tier=tier)
    return True


async def adopt_template(
    conn,
    space_id: UUID,
    template_slug: str,
    *,
    owner_id: UUID,
    tier: str,
    created_by: str = "agent",
) -> dict[str, Any]:
    template = find_automation(starter_templates(), template_slug)
    if template is None:
        raise KeyError(template_slug)
    existing = find_automation(await list_automations(conn, space_id), template_slug)
    if existing:
        return existing
    return await create_automation(
        conn,
        space_id,
        owner_id=owner_id,
        tier=tier,
        name=str(template["name"]),
        cron=str(template["cron"]),
        prompt=str(template["prompt"]),
        slug=template_slug,
        enabled=bool(template.get("enabled", True)),
        department=template.get("department"),
        action=template.get("action"),
        deliver=template.get("deliver"),
        context_from_slugs=template.get("context_from_slugs"),
        enabled_toolsets=template.get("enabled_toolsets"),
        created_by=created_by,
    )


async def run_automation(
    space_id: UUID,
    slug: str,
    *,
    user_id: UUID,
    manual: bool = True,
) -> dict[str, Any]:
    return await trigger_automation(space_id, slug, user_id=user_id, manual=manual)
