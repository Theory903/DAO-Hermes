"""Runtime hooks — auto-capture every AI task as a Trace Git commit."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any, TypeVar
from uuid import UUID

import asyncpg

from DAO.research_memory.capture import TraceCapture
from DAO.runtime import get_runtime_context

T = TypeVar("T")


async def capture_task(
    conn: asyncpg.Connection,
    space_id: UUID,
    intent: str,
    runner: Callable[[TraceCapture], Awaitable[T]],
    *,
    capability: str = "",
    department: str = "",
    task_type: str = "task",
    thread_slug: str | None = None,
    commit_message: str | None = None,
    agent_id: UUID | None = None,
    workflow_id: UUID | None = None,
    hermes_session_id: str | None = None,
    entity_keys: list[str] | None = None,
    force_fresh: bool = False,
) -> tuple[T | None, TraceCapture]:
    """
    Wrap any async task with Trace Git capture.

    Returns (result, capture). If dedup hits and force_fresh is False, runner
    is skipped and result is None.
    """
    slug = thread_slug or _default_thread_slug(intent, capability, department)
    async with TraceCapture(
        conn,
        space_id,
        intent,
        capability=capability,
        department=department,
        task_type=task_type,
        thread_slug=slug,
        commit_message=commit_message,
        agent_id=agent_id,
        workflow_id=workflow_id,
        hermes_session_id=hermes_session_id,
        entity_keys=entity_keys,
        force_fresh=force_fresh,
    ) as cap:
        if cap.reused and not force_fresh:
            return None, cap
        result = await runner(cap)
        return result, cap


async def capture_task_from_runtime(
    conn: asyncpg.Connection,
    intent: str,
    runner: Callable[[TraceCapture], Awaitable[T]],
    **kwargs: Any,
) -> tuple[T | None, TraceCapture]:
    """Same as capture_task but space_id from bind_hermes_runtime context."""
    ctx = get_runtime_context()
    if ctx is None or ctx.space_id is None:
        raise RuntimeError("capture_task_from_runtime requires bound runtime with space_id")
    return capture_task(conn, ctx.space_id, intent, runner, **kwargs)


def _default_thread_slug(intent: str, capability: str, department: str) -> str:
    base = capability or department or "general"
    slug = f"{base}-{intent[:40]}".lower().replace(" ", "-")
    return "".join(c if c.isalnum() or c in "-_" else "-" for c in slug)[:80]
