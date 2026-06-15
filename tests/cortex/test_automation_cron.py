"""Automation cron inject integration tests."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest

pytest.importorskip("asyncpg")

from DAO.db import rls_connection
from DAO.workers.automation_cron import trigger_automation


@pytest.mark.asyncio
async def test_trigger_morning_briefing_automation(test_space, test_user, tmp_path, monkeypatch):
    uid = test_user["id"]
    monkeypatch.setenv("DAO_PERSONAL_HERMES_HOME", str(tmp_path / "hermes"))
    with patch("DAO.cron.bridge._run_briefing", new_callable=AsyncMock) as mock_brief:
        mock_brief.return_value = {"status": "completed", "markdown": "# Brief"}
        result = await trigger_automation(
            test_space.id,
            "morning-briefing",
            user_id=uid,
            manual=True,
        )
    assert result["status"] == "completed"
    mock_brief.assert_awaited_once()

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        cfg = await conn.fetchval(
            "SELECT ai_lead_config FROM spaces WHERE id = $1",
            test_space.id,
        )
    if isinstance(cfg, str):
        cfg = json.loads(cfg)
    automations = cfg.get("automations") or []
    row = next((p for p in automations if p.get("slug") == "morning-briefing"), None)
    assert row is not None
    assert row.get("last_run_at")
    assert row.get("last_status") == "ok"


@pytest.mark.asyncio
async def test_trigger_research_scan_via_hermes_cron_job(test_space, test_user, tmp_path, monkeypatch):
    uid = test_user["id"]
    monkeypatch.setenv("DAO_PERSONAL_HERMES_HOME", str(tmp_path / "hermes"))
    with patch("cron.scheduler.run_job") as mock_run:
        mock_run.return_value = (True, "# out", "delegated", None)
        result = await trigger_automation(
            test_space.id,
            "research-scan",
            user_id=uid,
            manual=True,
        )

    assert result["status"] == "completed"
    assert result["agent_response"] == "delegated"
    mock_run.assert_called_once()
