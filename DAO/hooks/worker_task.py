"""Preflight + Trace Git capture for worker/delegate tool execution."""

from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID

from DAO.config import DAO_enabled
from DAO.db import rls_connection
from DAO.research_memory.hooks import capture_task
from DAO.research_memory.service import ResearchMemoryService
from DAO.runtime import get_runtime_context

_log = logging.getLogger(__name__)

_WORKER_TOOLS = frozenset({"delegate_task", "delegate", "research"})
_PREFLIGHT_THRESHOLD = 0.85
_MAX_CAPTURE_BYTES = 16_000


def maybe_worker_preflight(sid: str, tool_call_id: str, tool_name: str, args: dict | None) -> None:
    """Fire-and-forget from tool_start_callback before delegate/research runs."""
    if not DAO_enabled():
        return
    if tool_name not in _WORKER_TOOLS:
        return
    ctx = get_runtime_context()
    if ctx is None or ctx.space_id is None:
        return
    intent = _intent_from_args(args)
    if not intent:
        return
    dept = _dept_from_args(args)
    _schedule(
        _preflight_async(
            ctx.space_id,
            ctx.user_id,
            intent,
            dept,
            sid,
            tool_call_id,
        )
    )


def maybe_capture_worker_task(
    sid: str,
    tool_call_id: str,
    tool_name: str,
    args: dict | None,
    result: str,
) -> None:
    """Fire-and-forget from tool_complete_callback — Trace Git via capture_task."""
    if not DAO_enabled():
        return
    if tool_name not in _WORKER_TOOLS:
        return
    ctx = get_runtime_context()
    if ctx is None or ctx.space_id is None:
        return
    intent = _intent_from_args(args)
    if not intent:
        return
    dept = _dept_from_args(args)
    _schedule(
        _capture_async(
            ctx.space_id,
            ctx.user_id,
            intent,
            dept,
            tool_name,
            result,
            hermes_session_id=sid,
            tool_call_id=tool_call_id,
        )
    )


def _intent_from_args(args: dict | None) -> str:
    if not args:
        return ""
    for key in ("intent", "goal", "task", "query"):
        val = args.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    tasks = args.get("tasks")
    if isinstance(tasks, list) and tasks:
        first = tasks[0]
        if isinstance(first, dict):
            goal = first.get("goal") or first.get("task") or first.get("intent")
            if isinstance(goal, str) and goal.strip():
                return goal.strip()
    return ""


def _dept_from_args(args: dict | None) -> str:
    if not args:
        return ""
    for key in ("department", "dept"):
        val = args.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    tasks = args.get("tasks")
    if isinstance(tasks, list) and tasks:
        first = tasks[0]
        if isinstance(first, dict):
            dept = first.get("department") or first.get("dept")
            if isinstance(dept, str) and dept.strip():
                return dept.strip()
    return ""


def _result_summary(result: str) -> str:
    if not result:
        return ""
    text = str(result).strip()
    if len(text.encode("utf-8")) > _MAX_CAPTURE_BYTES:
        return text[:_MAX_CAPTURE_BYTES] + "\n…(truncated)"
    return text


def _schedule(coro) -> None:
    try:
        import asyncio

        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(coro)
        else:
            loop.run_until_complete(coro)
    except Exception as exc:
        _log.debug("DAO worker hook skipped: %s", exc)


async def _preflight_async(
    space_id: UUID,
    user_id: UUID,
    intent: str,
    department: str,
    sid: str,
    tool_call_id: str,
) -> dict[str, Any] | None:
    from DAO.comms.events import publish

    async with rls_connection(space_id=space_id, user_id=user_id) as conn:
        rm = ResearchMemoryService(conn, space_id)
        replay = await rm.resolve(intent, department=department)
        if not replay or replay.get("score", 0) < _PREFLIGHT_THRESHOLD:
            return None
        await publish(
            space_id,
            "research_memory_reused",
            {"session_id": replay["session_id"], "intent": intent, "tool_call_id": tool_call_id},
        )
        _log.debug(
            "worker preflight reuse sid=%s tool=%s session=%s",
            sid,
            tool_call_id,
            replay["session_id"],
        )
        return replay


async def _capture_async(
    space_id: UUID,
    user_id: UUID,
    intent: str,
    department: str,
    tool_name: str,
    result: str,
    *,
    hermes_session_id: str,
    tool_call_id: str,
) -> None:
    summary = _result_summary(result)

    async def runner(cap):
        await cap.log_tool(tool_name, intent, summary)
        conclusion = _conclusion_from_result(result)
        if conclusion:
            cap.set_conclusion(conclusion)
        return summary

    async with rls_connection(space_id=space_id, user_id=user_id) as conn:
        _result, cap = await capture_task(
            conn,
            space_id,
            intent,
            runner,
            capability="",
            department=department,
            task_type="delegate" if tool_name in ("delegate_task", "delegate") else "task",
            hermes_session_id=hermes_session_id,
        )
        if cap.reused:
            _log.debug("worker capture reused session=%s tool=%s", cap.session_id, tool_call_id)


def _conclusion_from_result(result: str) -> dict[str, Any] | None:
    if not result:
        return None
    try:
        parsed = json.loads(result)
        if isinstance(parsed, dict):
            if parsed.get("error"):
                return {"error": parsed["error"]}
            if isinstance(parsed.get("results"), list) and parsed["results"]:
                return {"results_count": len(parsed["results"]), "ok": True}
            return parsed
    except (json.JSONDecodeError, TypeError):
        pass
    return {"summary": _result_summary(result)[:500]}
