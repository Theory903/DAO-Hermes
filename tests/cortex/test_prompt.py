"""Volatile Space context in Hermes system prompt."""

from __future__ import annotations

from uuid import uuid4

from DAO.prompt import format_space_volatile_context
from DAO.runtime import bind_hermes_runtime, unbind_hermes_runtime


def test_format_space_volatile_context_empty_without_runtime():
    assert format_space_volatile_context() == ""


def test_format_space_volatile_context_includes_mission():
    handle = bind_hermes_runtime(
        user_id=uuid4(),
        space_id=uuid4(),
        space_name="Acme",
        lead_name="Jarvis",
        mission="Grow ARR",
    )
    try:
        block = format_space_volatile_context()
        assert "Acme" in block
        assert "Jarvis" in block
        assert "Grow ARR" in block
        assert "DAO_pulse" in block
        assert "Space ID:" in block
    finally:
        unbind_hermes_runtime(handle)
