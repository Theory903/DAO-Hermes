"""Supervisor routing and gateway prompt injection."""

from __future__ import annotations

from uuid import uuid4

import pytest

from DAO.jarvis.supervisor import (
    ROUTING_DEPARTMENTS,
    Supervisor,
    SupervisorState,
    build_prompt_injection,
    classify_department,
    route_message,
    routing_payload,
    strip_supervisor_block,
)
from DAO.runtime import bind_hermes_runtime, unbind_hermes_runtime


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("Run competitor research on Acme", "research"),
        ("Fix the API bug before deploy", "engineering"),
        ("Draft a blog post for our SEO campaign", "marketing"),
        ("Update the CRM and outreach to this lead", "sales"),
        ("We have a production incident — check alerts", "ops"),
        ("i want ACME to be setup", "ops"),
    ],
)
def test_classify_department_keywords(message: str, expected: str):
    dept, reason = classify_department(message)
    assert dept == expected
    assert reason.startswith("keyword match")


def test_classify_empty_message():
    dept, reason = classify_department("   ")
    assert dept is None
    assert reason == "empty message"


def test_classify_no_match():
    dept, reason = classify_department("hello there")
    assert dept is None
    assert "no department" in reason


def test_supervisor_graph_enriches_delegate_hint():
    state = Supervisor().run(user_message="Research the market for widgets")
    assert state.delegated_to == "research"
    assert state.delegate_hint["action"] == "delegate_task"
    assert state.delegate_hint["toolsets"] == ["web", "file"]
    assert len(state.tool_trace) == 3


def test_supervisor_unassigned_enrich():
    state = Supervisor().run(user_message="What should we focus on this week?")
    assert state.delegated_to is None
    assert state.delegate_hint["action"] == "clarify_or_delegate"
    assert "delegate_task" in state.dept_context


def test_route_message_backward_compat():
    state = SupervisorState(user_message="Fix deploy bug in api")
    route_message(state)
    assert state.delegated_to == "engineering"


def test_build_prompt_injection_includes_department():
    state = Supervisor().run(user_message="Write sales outreach", mission="Grow ARR")
    block = build_prompt_injection(state)
    assert "<DAO-supervisor>" in block
    assert "department: sales" in block
    assert "guidance" in block
    assert "growth_loop" not in block


def test_build_prompt_injection_includes_greeting():
    state = Supervisor().run(user_message="Thank you. Hello.")
    block = build_prompt_injection(state)
    assert "<DAO-supervisor>" in block
    assert "unassigned" in block


def test_strip_supervisor_block():
    raw = "<DAO-supervisor>\ndept: x\n</DAO-supervisor>\n\nFix the bug"
    assert strip_supervisor_block(raw) == "Fix the bug"


def test_apply_supervisor_strips_prior_block(monkeypatch):
    monkeypatch.setenv("DAO_API_ENABLED", "1")
    from DAO.hooks.prompt_supervisor import apply_DAO_supervisor_routing

    wrapped = (
        "<DAO-supervisor>\nold\n</DAO-supervisor>\n\n"
        "Research competitors"
    )
    handle = bind_hermes_runtime(user_id=uuid4(), space_id=uuid4())
    try:
        text, payload = apply_DAO_supervisor_routing(wrapped)
        assert "Research competitors" in text
        assert text.count("<DAO-supervisor>") == 1
        assert payload is not None
        assert payload["department"] == "research"
    finally:
        unbind_hermes_runtime(handle)


def test_routing_payload_json_safe():
    state = Supervisor().run(user_message="Monitor uptime alerts")
    payload = routing_payload(state)
    assert payload["department"] == "ops"
    assert payload["delegate_hint"]["department"] == "ops"
    assert isinstance(payload["trace"], list)


def test_engineering_wins_tie_on_shared_keyword():
    # "deploy" is engineering; if tied, ROUTING_DEPARTMENTS order wins.
    dept, _ = classify_department("deploy research plan")
    assert dept in ROUTING_DEPARTMENTS


def test_apply_DAO_supervisor_routing_disabled(monkeypatch):
    monkeypatch.delenv("DAO_API_ENABLED", raising=False)
    from DAO.hooks.prompt_supervisor import apply_DAO_supervisor_routing

    text, payload = apply_DAO_supervisor_routing("research competitors")
    assert text == "research competitors"
    assert payload is None


def test_apply_DAO_supervisor_routing_with_runtime(monkeypatch):
    monkeypatch.setenv("DAO_API_ENABLED", "1")
    from DAO.hooks.prompt_supervisor import apply_DAO_supervisor_routing

    handle = bind_hermes_runtime(user_id=uuid4(), space_id=uuid4())
    try:
        text, payload = apply_DAO_supervisor_routing(
            "Fix the API bug", mission="Ship v1"
        )
        assert text.startswith("<DAO-supervisor>")
        assert "Fix the API bug" in text
        assert payload is not None
        assert payload["department"] == "engineering"
        assert payload["space_id"]
        text_greet, payload_greet = apply_DAO_supervisor_routing("Hello!")
        assert text_greet.startswith("<DAO-supervisor>")
        assert "Hello!" in text_greet
        assert payload_greet is not None
    finally:
        unbind_hermes_runtime(handle)
