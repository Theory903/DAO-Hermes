"""Space prompt metadata for Hermes runtime binding."""

from __future__ import annotations

import json

from DAO.spaces.prompt_meta import space_prompt_meta_from_row


def test_space_prompt_meta_from_row_parses_json_config():
    row = {
        "name": "Acme Corp",
        "ai_lead_config": json.dumps({"name": "Jarvis", "mission": "Ship v1"}),
    }
    meta = space_prompt_meta_from_row(row)
    assert meta["space_name"] == "Acme Corp"
    assert meta["lead_name"] == "Jarvis"
    assert meta["mission"] == "Ship v1"


def test_space_prompt_meta_defaults():
    meta = space_prompt_meta_from_row({"name": "Solo", "ai_lead_config": {}})
    assert meta["lead_name"] == "Jarvis"
    assert meta["mission"] is None


def test_space_prompt_meta_none_row():
    meta = space_prompt_meta_from_row(None)
    assert meta == {"space_name": None, "lead_name": None, "mission": None}
