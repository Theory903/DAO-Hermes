"""Worker/delegate execution hooks — preflight reuse + Trace Git capture."""

from __future__ import annotations

import asyncio
import json

import pytest

from DAO.comms import events as event_bus
from DAO.db import rls_connection
from DAO.hooks.worker_task import (
    _capture_async,
    _intent_from_args,
    maybe_capture_worker_task,
    maybe_worker_preflight,
)
from DAO.research_memory.service import ResearchMemoryService
from DAO.runtime import bind_hermes_runtime, unbind_hermes_runtime


def test_intent_from_delegate_args():
    assert _intent_from_args({"goal": "Analyze Acme pricing"}) == "Analyze Acme pricing"
    assert (
        _intent_from_args({"tasks": [{"goal": "Draft blog post", "dept": "marketing"}]})
        == "Draft blog post"
    )
    assert _intent_from_args({"intent": "quarterly forecast"}) == "quarterly forecast"
    assert _intent_from_args({}) == ""


@pytest.mark.asyncio
async def test_worker_preflight_publishes_reuse_event(test_space, test_user):
    uid = test_user["id"]
    intent = "worker hook preflight reuse intent"

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        svc = ResearchMemoryService(conn, test_space.id)
        sid = await svc.start_session(intent, department="research")
        await svc.append_trace(
            sid,
            step_type="reasoning",
            output_summary="Prior work exists.",
        )
        await svc.finalize_session(sid)

    bind = bind_hermes_runtime(user_id=uid, space_id=test_space.id, tier="solo")
    received: list[str] = []

    async def collect():
        async for msg in event_bus.subscribe(test_space.id):
            received.append(msg)
            break

    listener = asyncio.create_task(collect())
    await asyncio.sleep(0.05)

    try:
        maybe_worker_preflight("hermes-sid", "tc-1", "delegate_task", {"goal": intent, "department": "research"})
        await asyncio.wait_for(listener, timeout=5.0)
    finally:
        listener.cancel()
        unbind_hermes_runtime(bind)

    assert received, "expected research_memory_reused SSE event"
    payload = json.loads(received[0])
    assert payload["type"] == "research_memory_reused"
    assert payload["payload"]["intent"] == intent
    assert payload["payload"]["session_id"]


@pytest.mark.asyncio
async def test_worker_capture_records_delegate_result(test_space, test_user):
    uid = test_user["id"]
    intent = "worker hook capture fresh intent"

    bind = bind_hermes_runtime(user_id=uid, space_id=test_space.id, tier="solo")
    try:
        await _capture_async(
            test_space.id,
            uid,
            intent,
            "engineering",
            "delegate_task",
            json.dumps({"results": [{"goal": intent, "status": "ok"}]}),
            hermes_session_id="hermes-sid",
            tool_call_id="tc-2",
        )
    finally:
        unbind_hermes_runtime(bind)

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        svc = ResearchMemoryService(conn, test_space.id)
        replay = await svc.resolve(intent, department="engineering")

    assert replay is not None
    assert replay["session_id"]
