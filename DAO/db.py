"""Async Postgres pool and RLS session helpers."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator
from uuid import UUID

import asyncpg

from DAO.config import database_url

_log = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None
_pool_loop: asyncio.AbstractEventLoop | None = None


async def init_pool() -> asyncpg.Pool:
    global _pool, _pool_loop
    if _pool is None:
        _pool_loop = asyncio.get_running_loop()
        _pool = await asyncpg.create_pool(database_url(), min_size=1, max_size=10)
        _log.info("DAO Postgres pool initialized")
    return _pool


async def close_pool() -> None:
    global _pool, _pool_loop
    if _pool is not None:
        await _pool.close()
        _pool = None
        _pool_loop = None


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database pool not initialized — call init_pool() in lifespan")
    return _pool


@asynccontextmanager
async def rls_connection(
    *,
    space_id: UUID | None = None,
    user_id: UUID | None = None,
) -> AsyncIterator[asyncpg.Connection]:
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            if user_id is not None:
                await conn.execute(
                    "SELECT set_config('app.current_user_id', $1, true)",
                    str(user_id),
                )
            if space_id is not None:
                await conn.execute(
                    "SELECT set_config('app.current_space_id', $1, true)",
                    str(space_id),
                )
            yield conn


@asynccontextmanager
async def admin_connection() -> AsyncIterator[asyncpg.Connection]:
    """Connection without RLS context — for provisioning and auth lookups."""
    pool = get_pool()
    async with pool.acquire() as conn:
        yield conn


@asynccontextmanager
async def rls_standalone(
    *,
    space_id: UUID | None = None,
    user_id: UUID | None = None,
) -> AsyncIterator[asyncpg.Connection]:
    """RLS session on a dedicated connection (for Hermes cron / sync threads)."""
    conn = await asyncpg.connect(database_url())
    try:
        async with conn.transaction():
            if user_id is not None:
                await conn.execute(
                    "SELECT set_config('app.current_user_id', $1, true)",
                    str(user_id),
                )
            if space_id is not None:
                await conn.execute(
                    "SELECT set_config('app.current_space_id', $1, true)",
                    str(space_id),
                )
            yield conn
    finally:
        await conn.close()


def run_sync(coro):
    """Run async DAO code from Hermes tool worker threads or cron threads.

    The asyncpg pool is bound to the API/gateway event loop. Tool handlers run
    on thread-pool workers with no loop (or a disposable loop), so we schedule
    the coroutine back onto the pool loop instead of ``asyncio.run()`` in the
    worker — otherwise ``rls_connection`` raises "attached to a different loop".
    """
    import asyncio

    pool_loop = _pool_loop
    if pool_loop is not None and pool_loop.is_running():
        try:
            current = asyncio.get_running_loop()
        except RuntimeError:
            current = None
        if current is pool_loop:
            raise RuntimeError(
                "run_sync() cannot be called on the API event loop; await the coroutine instead."
            )
        future = asyncio.run_coroutine_threadsafe(coro, pool_loop)
        return future.result(timeout=120)

    return asyncio.run(coro)


def schedule_fire_and_forget(coro) -> None:
    """Schedule a coroutine on the API pool loop from sync Hermes tool callbacks."""
    import asyncio

    pool_loop = _pool_loop
    if pool_loop is not None and pool_loop.is_running():
        try:
            current = asyncio.get_running_loop()
        except RuntimeError:
            current = None
        if current is pool_loop:
            pool_loop.create_task(coro)
            return
        asyncio.run_coroutine_threadsafe(coro, pool_loop)
        return

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(coro)
    except RuntimeError:
        asyncio.run(coro)
