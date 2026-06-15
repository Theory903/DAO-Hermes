"""Command Center / comms route tests."""

from __future__ import annotations

import pytest

pytest.importorskip("asyncpg")

from DAO.comms import events as event_bus
from DAO.db import rls_connection


@pytest.mark.asyncio
async def test_dept_status_for_space_with_rls_conn(test_space, test_user):
    async with rls_connection(space_id=test_space.id, user_id=test_user["id"]) as conn:
        depts = await event_bus.dept_status_for_space(conn, test_space.id)
    assert set(depts.keys()) == {"research", "engineering", "marketing", "sales", "ops"}
    assert all(status in ("idle", "active", "needs_approval") for status in depts.values())
