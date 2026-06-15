"""DAO API integration tests (no DB required for unit-level)."""

from __future__ import annotations

import os

import pytest

from DAO.jarvis.supervisor import SupervisorState, route_message


def test_supervisor_routes_research():
    os.environ.setdefault("JWT_SECRET", "test-secret")
    state = SupervisorState(user_message="Run competitor research on Acme")
    route_message(state)
    assert state.delegated_to == "research"


def test_supervisor_routes_engineering():
    state = SupervisorState(user_message="Fix the API bug in deploy")
    route_message(state)
    assert state.delegated_to == "engineering"


def test_compile_graph_import():
    from DAO.canvas.router import _compile_graph

    g = _compile_graph("Research market, draft email, get approval")
    assert len(g["nodes"]) >= 2
