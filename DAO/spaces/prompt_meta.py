"""Parse Space row fields for Hermes runtime binding."""

from __future__ import annotations

import json
from typing import Any


def space_prompt_meta_from_row(row: Any) -> dict[str, str | None]:
    """Extract ``space_name``, ``lead_name``, ``mission`` from a spaces row."""
    if row is None:
        return {"space_name": None, "lead_name": None, "mission": None}

    cfg = row.get("ai_lead_config") if hasattr(row, "get") else row["ai_lead_config"]
    if isinstance(cfg, str):
        try:
            cfg = json.loads(cfg)
        except json.JSONDecodeError:
            cfg = {}
    if not isinstance(cfg, dict):
        cfg = {}

    name = row.get("name") if hasattr(row, "get") else row["name"]
    lead = (cfg.get("name") or "Jarvis").strip() or "Jarvis"
    mission = (cfg.get("mission") or "").strip() or None
    return {
        "space_name": str(name) if name else None,
        "lead_name": lead,
        "mission": mission,
    }
