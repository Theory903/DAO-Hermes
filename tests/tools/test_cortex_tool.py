"""Tests for DAO company-layer Hermes tools."""

from __future__ import annotations

import json
from unittest.mock import patch


def test_DAO_tools_hidden_without_runtime():
    import tools.DAO_tool as mod

    with patch.object(mod, "_check_DAO_mode", return_value=False):
        from tools.registry import registry

        names = {
            d["function"]["name"]
            for d in registry.get_definitions(
                tool_names=["DAO_navigate", "DAO_reports", "DAO_pulse", "DAO_store_knowledge"]
            )
        }
    assert "DAO_navigate" not in names


def test_DAO_navigate_rejects_unknown_screen():
    import tools.DAO_tool as mod

    with patch.object(mod, "_check_DAO_mode", return_value=True):
        out = json.loads(mod.DAO_navigate(screen="not-a-screen"))
    assert "error" in out


def test_DAO_navigate_requires_space():
    import tools.DAO_tool as mod

    with patch.object(mod, "_check_DAO_mode", return_value=True):
        with patch.object(mod, "_require_space", side_effect=RuntimeError("no space")):
            out = json.loads(mod.DAO_navigate(screen="inbox"))
    assert out["error"] == "no space"
