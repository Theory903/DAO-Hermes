"""run_sync must marshal coroutines onto the pool's event loop from tool threads."""

from __future__ import annotations

import concurrent.futures

import pytest

from DAO.db import init_pool, rls_connection, run_sync


@pytest.mark.asyncio
async def test_run_sync_from_worker_thread_uses_pool_loop(db_pool, test_space, test_user):
    uid = test_user["id"]
    sid = test_space.id

    async def _fetch_slug() -> str:
        async with rls_connection(space_id=sid, user_id=uid) as conn:
            return await conn.fetchval("SELECT slug FROM spaces WHERE id = $1", sid)

    def _worker() -> str:
        return run_sync(_fetch_slug())

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        slug = executor.submit(_worker).result(timeout=30)

    assert slug == test_space.slug


@pytest.mark.asyncio
async def test_run_sync_rejects_call_on_pool_loop(db_pool, test_space, test_user):
    await init_pool()

    async def _noop() -> None:
        return None

    with pytest.raises(RuntimeError, match="cannot be called on the API event loop"):
        run_sync(_noop())
