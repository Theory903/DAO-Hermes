"""Automation catalog and cron due detection."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

pytest.importorskip("croniter")

from DAO.jarvis.automations import (
    automation_prompt,
    automations_from_config,
    is_automation_due,
    starter_templates,
)


def test_starter_templates_has_six_entries():
    rows = starter_templates()
    assert len(rows) == 6
    assert {r["slug"] for r in rows} == {
        "morning-briefing",
        "research-scan",
        "content-pipeline",
        "sales-outreach",
        "ops-health",
        "dream-prep",
    }


def test_automations_from_config_preserves_stored_overrides():
    rows = automations_from_config(
        {
            "automations": [
                {
                    "slug": "research-scan",
                    "name": "Research Scan",
                    "enabled": False,
                    "cron": "0 8 * * *",
                }
            ]
        }
    )
    assert len(rows) == 1
    assert rows[0]["enabled"] is False
    assert rows[0]["cron"] == "0 8 * * *"


def test_is_automation_due_when_never_run():
    now = datetime(2026, 6, 14, 7, 5, tzinfo=timezone.utc)
    due = is_automation_due(
        {"slug": "morning-briefing", "enabled": True, "cron": "0 7 * * *"},
        now=now,
    )
    assert due is True


def test_is_automation_due_skips_disabled():
    now = datetime(2026, 6, 14, 7, 5, tzinfo=timezone.utc)
    assert (
        is_automation_due(
            {"slug": "morning-briefing", "enabled": False, "cron": "0 7 * * *"},
            now=now,
        )
        is False
    )


def test_is_automation_due_respects_recent_last_run():
    now = datetime(2026, 6, 14, 7, 5, tzinfo=timezone.utc)
    assert (
        is_automation_due(
            {
                "slug": "morning-briefing",
                "enabled": True,
                "cron": "0 7 * * *",
                "last_run_at": "2026-06-14T07:04:30+00:00",
            },
            now=now,
        )
        is False
    )


def test_automation_prompt_uses_row_prompt():
    row = next(t for t in starter_templates() if t["slug"] == "ops-health")
    text = automation_prompt(row)
    assert "monitors" in text.lower()
