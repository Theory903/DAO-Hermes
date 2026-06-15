"""Hermes cron sync for DAO automations."""

from __future__ import annotations

import pytest

pytest.importorskip("asyncpg")

from DAO.cron.home import cron_jobs_home
from DAO.cron.sync import find_automation_job, sync_space_automations_to_cron
from DAO.jarvis.automations import STARTER_TEMPLATES


@pytest.mark.asyncio
async def test_sync_writes_automation_cron_jobs(test_space, test_user, tmp_path, monkeypatch):
    uid = test_user["id"]
    space_id = test_space.id
    monkeypatch.setenv("DAO_PERSONAL_HERMES_HOME", str(tmp_path / "hermes"))

    count = await sync_space_automations_to_cron(
        space_id,
        owner_id=uid,
        tier="solo",
    )
    assert count == len(STARTER_TEMPLATES)

    with cron_jobs_home(user_id=uid, space_id=space_id, tier="solo"):
        from cron.jobs import load_jobs

        jobs = load_jobs()
        DAO_jobs = [
            j
            for j in jobs
            if isinstance(j.get("origin"), dict)
            and isinstance(j["origin"].get("DAO"), dict)
        ]
        assert len(DAO_jobs) == len(STARTER_TEMPLATES)

        briefing_job = find_automation_job(space_id, "morning-briefing")
        assert briefing_job is not None
        assert briefing_job["origin"]["DAO"]["space_id"] == str(space_id)
        assert briefing_job["origin"]["DAO"]["action"] == "briefing"
        assert briefing_job["schedule"]["expr"] == "0 7 * * *"
        assert briefing_job.get("next_run_at")
        assert briefing_job.get("schedule_display")


@pytest.mark.asyncio
async def test_sync_wires_context_from_chain(test_space, test_user, tmp_path, monkeypatch):
    uid = test_user["id"]
    space_id = test_space.id
    monkeypatch.setenv("DAO_PERSONAL_HERMES_HOME", str(tmp_path / "hermes"))

    await sync_space_automations_to_cron(space_id, owner_id=uid, tier="solo")

    with cron_jobs_home(user_id=uid, space_id=space_id, tier="solo"):
        research = find_automation_job(space_id, "research-scan")
        dream = find_automation_job(space_id, "dream-prep")
        assert research is not None and dream is not None
        assert research.get("context_from") == [dream["id"]]


@pytest.mark.asyncio
async def test_enrich_automations_attaches_hermes_status(test_space, test_user, tmp_path, monkeypatch):
    from DAO.cron.status import enrich_automations
    from DAO.jarvis.automations import starter_templates

    uid = test_user["id"]
    space_id = test_space.id
    monkeypatch.setenv("DAO_PERSONAL_HERMES_HOME", str(tmp_path / "hermes"))
    await sync_space_automations_to_cron(space_id, owner_id=uid, tier="solo")

    rows = enrich_automations(
        starter_templates(),
        space_id=space_id,
        owner_id=uid,
        tier="solo",
    )
    briefing = next(r for r in rows if r["slug"] == "morning-briefing")
    assert briefing.get("cron_job_id")
    assert briefing.get("schedule_display") == "0 7 * * *"
    assert briefing.get("next_run_at")


@pytest.mark.asyncio
async def test_sync_is_idempotent(test_space, test_user, tmp_path, monkeypatch):
    uid = test_user["id"]
    space_id = test_space.id
    monkeypatch.setenv("DAO_PERSONAL_HERMES_HOME", str(tmp_path / "hermes"))

    await sync_space_automations_to_cron(space_id, owner_id=uid, tier="solo")
    await sync_space_automations_to_cron(space_id, owner_id=uid, tier="solo")

    with cron_jobs_home(user_id=uid, space_id=space_id, tier="solo"):
        from cron.jobs import load_jobs

        DAO_jobs = [
            j
            for j in load_jobs()
            if isinstance(j.get("origin"), dict)
            and isinstance(j["origin"].get("DAO"), dict)
            and j["origin"]["DAO"].get("space_id") == str(space_id)
        ]
        assert len(DAO_jobs) == len(STARTER_TEMPLATES)
