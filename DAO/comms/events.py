"""In-process + optional Redis event bus for Command Center SSE."""

from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from typing import Any, AsyncIterator
from uuid import UUID

from DAO.config import redis_url

_log = logging.getLogger(__name__)

_subscribers: dict[str, list[asyncio.Queue[str]]] = defaultdict(list)
_lock = asyncio.Lock()


async def publish(space_id: UUID, event_type: str, payload: dict[str, Any]) -> None:
    msg = json.dumps({"type": event_type, "payload": payload})
    url = redis_url()
    if url:
        try:
            import redis.asyncio as aioredis

            client = aioredis.from_url(url)
            await client.publish(f"DAO:space:{space_id}", msg)
            await client.aclose()
            return
        except Exception as exc:
            _log.debug("Redis publish failed, falling back to memory: %s", exc)

    async with _lock:
        for q in _subscribers[str(space_id)]:
            await q.put(msg)


async def subscribe(space_id: UUID) -> AsyncIterator[str]:
    q: asyncio.Queue[str] = asyncio.Queue(maxsize=256)
    key = str(space_id)
    async with _lock:
        _subscribers[key].append(q)
    try:
        while True:
            yield await q.get()
    finally:
        async with _lock:
            if q in _subscribers[key]:
                _subscribers[key].remove(q)


def dept_status_snapshot() -> dict[str, str]:
    return {
        "research": "idle",
        "engineering": "idle",
        "marketing": "idle",
        "sales": "idle",
        "ops": "idle",
    }


async def dept_status_for_space(conn, space_id: UUID) -> dict[str, str]:
    """Derive lane status from pending HITL and recent handoffs."""
    from DAO.org.service import get_org_config_row

    cfg = await get_org_config_row(conn, space_id)
    base = {dept: "idle" for dept in cfg.get("departments") or []}
    pending = await conn.fetch(
        """
        SELECT a.department, count(*) AS n
        FROM hitl_requests h
        JOIN agents a ON a.id = h.agent_id
        WHERE h.space_id = $1 AND h.status = 'pending' AND a.department IS NOT NULL
        GROUP BY a.department
        """,
        space_id,
    )
    for row in pending:
        dept = str(row["department"]).lower()
        if dept in base:
            base[dept] = "needs_approval"

    active = await conn.fetch(
        """
        SELECT DISTINCT to_dept AS department
        FROM interdept_messages
        WHERE space_id = $1 AND created_at > now() - interval '2 hours'
        """,
        space_id,
    )
    for row in active:
        dept = str(row["department"]).lower()
        if dept in base and base[dept] == "idle":
            base[dept] = "active"
    return base
