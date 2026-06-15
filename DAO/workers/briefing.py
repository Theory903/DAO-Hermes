"""Morning briefing worker."""

from __future__ import annotations

from uuid import UUID

from DAO.db import rls_connection
from DAO.jarvis import briefing as briefing_svc


async def run_briefing(space_id: UUID, *, user_id: UUID | None = None) -> dict:
    async with rls_connection(space_id=space_id, user_id=user_id) as conn:
        result = await briefing_svc.generate_and_store_briefing(
            conn, space_id, trigger_source="worker"
        )
    return {"space_id": str(space_id), "status": "completed", **result}
