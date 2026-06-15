"""Preflight reuse — duplicate intent returns Research Memory hit without new work."""

from __future__ import annotations

import pytest

from DAO.db import rls_connection
from DAO.drive.router import PreflightRequest, preflight
from DAO.research_memory.service import ResearchMemoryService


class _FakeRequest:
    def __init__(self, user_id):
        self.state = type("State", (), {"user": {"id": user_id}})()


@pytest.mark.asyncio
async def test_preflight_reuses_completed_research_session(test_space, test_user):
    uid = test_user["id"]
    intent = "compile quarterly revenue forecast assumptions"

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        svc = ResearchMemoryService(conn, test_space.id)
        sid = await svc.start_session(intent, department="research")
        await svc.append_trace(
            sid,
            step_type="reasoning",
            output_summary="Reused prior model assumptions from Drive.",
        )
        await svc.finalize_session(sid)

    req = _FakeRequest(uid)
    body = PreflightRequest(intent=intent, department="research", threshold=0.85)
    result = await preflight(test_space.id, body, req)

    assert result.reuse_recommended is True
    assert len(result.hits) >= 1
    assert result.hits[0].score >= 0.85
