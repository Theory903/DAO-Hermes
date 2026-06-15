"""Org department catalog and provisioning templates."""

from __future__ import annotations

from typing import Any

# Executive is always provisioned for the AI Lead — not shown as a selectable lane.
DEPARTMENT_CATALOG: dict[str, dict[str, str]] = {
    "research": {"label": "Research", "color": "#22d3ee"},
    "engineering": {"label": "Engineering", "color": "#818cf8"},
    "marketing": {"label": "Marketing", "color": "#f472b6"},
    "sales": {"label": "Sales", "color": "#34d399"},
    "ops": {"label": "Operations", "color": "#fbbf24"},
    "finance": {"label": "Finance", "color": "#a3e635"},
    "legal": {"label": "Legal", "color": "#94a3b8"},
    "support": {"label": "Support", "color": "#38bdf8"},
    "design": {"label": "Design", "color": "#e879f9"},
    "data": {"label": "Data", "color": "#2dd4bf"},
    "executive": {"label": "Executive", "color": "#c4b5fd"},
}

ORG_TEMPLATES: dict[str, dict[str, Any]] = {
    "standard-five": {
        "id": "standard-five",
        "name": "Standard Company",
        "description": "Research, Engineering, Marketing, Sales, and Operations — the default DAO layout.",
        "departments": ["research", "engineering", "marketing", "sales", "ops"],
    },
    "lean-three": {
        "id": "lean-three",
        "name": "Lean Startup",
        "description": "Research, Engineering, and Operations for a small product team.",
        "departments": ["research", "engineering", "ops"],
    },
    "growth": {
        "id": "growth",
        "name": "Growth Team",
        "description": "Marketing, Sales, and Operations focused on pipeline and revenue.",
        "departments": ["marketing", "sales", "ops"],
    },
    "product-studio": {
        "id": "product-studio",
        "name": "Product Studio",
        "description": "Research, Design, Engineering, and Data for product-led companies.",
        "departments": ["research", "design", "engineering", "data"],
    },
    "full-stack": {
        "id": "full-stack",
        "name": "Full Stack",
        "description": "Eight departments including Finance, Legal, and Support.",
        "departments": [
            "research",
            "engineering",
            "marketing",
            "sales",
            "ops",
            "finance",
            "legal",
            "support",
        ],
    },
    "custom": {
        "id": "custom",
        "name": "Custom",
        "description": "Pick departments from the catalog to match your company.",
        "departments": [],
    },
}

DEFAULT_TEMPLATE_ID = "standard-five"
DEFAULT_DEPARTMENTS = ORG_TEMPLATES[DEFAULT_TEMPLATE_ID]["departments"]


def normalize_department_keys(keys: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in keys:
        key = raw.strip().lower()
        if not key or key == "executive" or key not in DEPARTMENT_CATALOG:
            continue
        if key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


def department_payload(key: str) -> dict[str, str]:
    meta = DEPARTMENT_CATALOG[key]
    return {"key": key, "label": meta["label"], "color": meta["color"]}


def departments_payload(keys: list[str]) -> list[dict[str, str]]:
    return [department_payload(k) for k in keys if k in DEPARTMENT_CATALOG]


def template_payload(template_id: str) -> dict[str, Any]:
    tpl = ORG_TEMPLATES[template_id]
    depts = normalize_department_keys(tpl.get("departments") or [])
    return {
        "id": tpl["id"],
        "name": tpl["name"],
        "description": tpl["description"],
        "departments": departments_payload(depts),
    }


def list_templates() -> list[dict[str, Any]]:
    return [template_payload(tid) for tid in ORG_TEMPLATES]


def catalog_payload() -> list[dict[str, str]]:
    return [
        department_payload(key)
        for key in DEPARTMENT_CATALOG
        if key != "executive"
    ]


def suggest_template_id(*, mission: str | None = None, space_name: str | None = None) -> tuple[str, str]:
    """Rule-based template suggestion from mission / space name."""
    text = " ".join(filter(None, [mission, space_name])).lower()
    if any(w in text for w in ("growth", "gtm", "pipeline", "revenue", "sales")):
        return "growth", "Mission mentions growth or revenue — Growth Team fits."
    if any(w in text for w in ("product", "design", "ux", "roadmap")):
        return "product-studio", "Product-focused language — Product Studio fits."
    if any(w in text for w in ("lean", "mvp", "startup", "seed")):
        return "lean-three", "Early-stage signals — Lean Startup fits."
    if any(w in text for w in ("enterprise", "compliance", "finance", "legal")):
        return "full-stack", "Enterprise signals — Full Stack fits."
    return DEFAULT_TEMPLATE_ID, "Default five-department company layout."


def default_org_config() -> dict[str, Any]:
    return {
        "template_id": DEFAULT_TEMPLATE_ID,
        "departments": list(DEFAULT_DEPARTMENTS),
    }
