"""Org provisioning and per-space department config."""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from DAO.org.catalog import (
    DEFAULT_TEMPLATE_ID,
    DEPARTMENT_CATALOG,
    ORG_TEMPLATES,
    catalog_payload,
    default_org_config,
    department_payload,
    departments_payload,
    normalize_department_keys,
    suggest_template_id,
    template_payload,
)

LEAD_TOOLS = ["delegate", "memory", "session_search"]
WORKER_TOOLS = ["delegate"]


async def get_org_config_row(conn, space_id: UUID) -> dict[str, Any]:
    try:
        row = await conn.fetchrow("SELECT org_config FROM spaces WHERE id = $1", space_id)
    except Exception:
        return default_org_config()
    if not row:
        return default_org_config()
    cfg = row["org_config"]
    if isinstance(cfg, str):
        cfg = json.loads(cfg)
    if not isinstance(cfg, dict):
        return default_org_config()
    depts = normalize_department_keys(cfg.get("departments") or [])
    template_id = str(cfg.get("template_id") or DEFAULT_TEMPLATE_ID)
    if not depts:
        tpl = ORG_TEMPLATES.get(template_id) or ORG_TEMPLATES[DEFAULT_TEMPLATE_ID]
        depts = normalize_department_keys(tpl.get("departments") or [])
    return {"template_id": template_id, "departments": depts}


async def save_org_config(conn, space_id: UUID, config: dict[str, Any]) -> dict[str, Any]:
    depts = normalize_department_keys(config.get("departments") or [])
    template_id = str(config.get("template_id") or "custom")
    if template_id != "custom" and template_id in ORG_TEMPLATES:
        tpl_depts = normalize_department_keys(ORG_TEMPLATES[template_id].get("departments") or [])
        if tpl_depts:
            depts = tpl_depts
    if not depts:
        raise ValueError("At least one department is required")
    saved = {"template_id": template_id, "departments": depts}
    await conn.execute(
        "UPDATE spaces SET org_config = $2::jsonb WHERE id = $1",
        space_id,
        json.dumps(saved),
    )
    return saved


async def infer_departments_from_agents(conn, space_id: UUID) -> list[str]:
    rows = await conn.fetch(
        """
        SELECT DISTINCT department FROM agents
        WHERE space_id = $1 AND department IS NOT NULL AND department <> 'executive'
        ORDER BY department
        """,
        space_id,
    )
    return normalize_department_keys([str(r["department"]) for r in rows])


async def get_departments_view(conn, space_id: UUID) -> dict[str, Any]:
    cfg = await get_org_config_row(conn, space_id)
    keys = cfg["departments"]
    if not keys:
        keys = await infer_departments_from_agents(conn, space_id)
    return {
        "template_id": cfg["template_id"],
        "departments": departments_payload(keys),
        "catalog": catalog_payload(),
    }


async def _clear_org(conn, space_id: UUID) -> None:
    await conn.execute("DELETE FROM org_edges WHERE space_id = $1", space_id)
    await conn.execute("DELETE FROM agents WHERE space_id = $1", space_id)


async def _get_or_create_ai_lead(conn, space_id: UUID, ai_lead_name: str) -> UUID:
    row = await conn.fetchrow(
        """
        SELECT id FROM agents
        WHERE space_id = $1 AND agent_type = 'ai_lead'
        ORDER BY created_at NULLS LAST
        LIMIT 1
        """,
        space_id,
    )
    if row:
        return row["id"]
    return await conn.fetchval(
        """
        INSERT INTO agents (
            space_id, name, role, department, agent_type, model_tier, system_instruction
        ) VALUES ($1, $2, 'AI Lead', 'executive', 'ai_lead', 1, $3)
        RETURNING id
        """,
        space_id,
        ai_lead_name,
        f"You are {ai_lead_name}, the AI Lead of this company. Route work to department leads.",
    )


async def _ensure_department_team(conn, space_id: UUID, ai_lead_id: UUID, dept: str) -> None:
    exists = await conn.fetchval(
        "SELECT 1 FROM agents WHERE space_id = $1 AND department = $2 LIMIT 1",
        space_id,
        dept,
    )
    if exists:
        return

    label = DEPARTMENT_CATALOG[dept]["label"]
    lead_id = await conn.fetchval(
        """
        INSERT INTO agents (
            space_id, name, role, department, agent_type, model_tier,
            system_instruction, parent_agent_id, tool_allowlist
        ) VALUES ($1, $2, $3, $4, 'lead', 2, $5, $6, $7::jsonb)
        RETURNING id
        """,
        space_id,
        f"{label} Lead",
        f"{label} Lead",
        dept,
        f"You lead the {label} department.",
        ai_lead_id,
        json.dumps(LEAD_TOOLS),
    )
    await upsert_supervises_edge(conn, space_id, ai_lead_id, lead_id)

    worker_id = await conn.fetchval(
        """
        INSERT INTO agents (
            space_id, name, role, department, agent_type, model_tier,
            system_instruction, parent_agent_id, tool_allowlist
        ) VALUES ($1, $2, $3, $4, 'worker', 3, $5, $6, $7::jsonb)
        RETURNING id
        """,
        space_id,
        f"{label} Worker",
        f"{label} Worker",
        dept,
        f"You execute tasks for the {label} department.",
        lead_id,
        json.dumps(WORKER_TOOLS),
    )
    await upsert_supervises_edge(conn, space_id, lead_id, worker_id)


async def merge_departments(
    conn,
    space_id: UUID,
    ai_lead_name: str,
    department_keys: list[str],
    *,
    template_id: str,
) -> None:
    """Add missing department teams and update config without removing existing agents."""
    depts = normalize_department_keys(department_keys)
    if not depts:
        raise ValueError("At least one department is required")
    ai_lead_id = await _get_or_create_ai_lead(conn, space_id, ai_lead_name)
    for dept in depts:
        await _ensure_department_team(conn, space_id, ai_lead_id, dept)
    await save_org_config(
        conn,
        space_id,
        {"template_id": template_id, "departments": depts},
    )


async def seed_org(
    conn,
    space_id: UUID,
    ai_lead_name: str,
    department_keys: list[str],
    *,
    template_id: str = DEFAULT_TEMPLATE_ID,
) -> None:
    """Provision AI Lead + lead/worker pairs for each department."""
    depts = normalize_department_keys(department_keys)
    if not depts:
        raise ValueError("At least one department is required")

    ai_lead_id = await _get_or_create_ai_lead(conn, space_id, ai_lead_name)

    for dept in depts:
        await _ensure_department_team(conn, space_id, ai_lead_id, dept)

    await save_org_config(
        conn,
        space_id,
        {"template_id": template_id, "departments": depts},
    )


async def apply_template(
    conn,
    space_id: UUID,
    template_id: str,
    ai_lead_name: str,
    *,
    replace: bool = False,
    custom_departments: list[str] | None = None,
) -> dict[str, Any]:
    if template_id == "custom":
        depts = normalize_department_keys(custom_departments or [])
        if not depts:
            raise ValueError("Custom template requires departments")
    elif template_id not in ORG_TEMPLATES:
        raise ValueError(f"Unknown template: {template_id}")
    else:
        depts = normalize_department_keys(ORG_TEMPLATES[template_id].get("departments") or [])

    count = await conn.fetchval("SELECT count(*) FROM agents WHERE space_id = $1", space_id)
    if replace and count:
        await _clear_org(conn, space_id)
        await seed_org(conn, space_id, ai_lead_name, depts, template_id=template_id)
    elif count:
        await merge_departments(
            conn, space_id, ai_lead_name, depts, template_id=template_id
        )
    else:
        await seed_org(conn, space_id, ai_lead_name, depts, template_id=template_id)
    return await get_departments_view(conn, space_id)


def suggest_org(*, mission: str | None, space_name: str | None) -> dict[str, Any]:
    template_id, reason = suggest_template_id(mission=mission, space_name=space_name)
    return {
        "template_id": template_id,
        "reason": reason,
        "template": template_payload(template_id),
    }


async def upsert_supervises_edge(
    conn, space_id: UUID, parent_id: UUID | None, child_id: UUID
) -> None:
    if not parent_id:
        return
    await conn.execute(
        "DELETE FROM org_edges WHERE space_id = $1 AND to_agent_id = $2 AND edge_type = 'supervises'",
        space_id,
        child_id,
    )
    await conn.execute(
        """
        INSERT INTO org_edges (space_id, from_agent_id, to_agent_id, edge_type)
        VALUES ($1, $2, $3, 'supervises')
        ON CONFLICT DO NOTHING
        """,
        space_id,
        parent_id,
        child_id,
    )


def chart_nodes_from_agents(agents: list) -> list[dict[str, Any]]:
    return [
        {
            "id": str(a["id"]),
            "label": a["name"],
            "department": a["department"],
            "agent_type": a["agent_type"],
            "role": a.get("role"),
            "model_tier": a.get("model_tier"),
            "parent_id": str(a["parent_agent_id"]) if a.get("parent_agent_id") else None,
        }
        for a in agents
    ]


def chart_edges_from_agents(agents: list) -> list[dict[str, Any]]:
    edges: list[dict[str, Any]] = []
    for a in agents:
        parent = a.get("parent_agent_id")
        if parent:
            edges.append(
                {
                    "from": str(parent),
                    "to": str(a["id"]),
                    "type": "supervises",
                }
            )
    return edges
