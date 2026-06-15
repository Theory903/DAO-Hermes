"""Tests for DAO gateway runtime propagation into agent threads."""

from __future__ import annotations

from uuid import uuid4

from DAO.gateway_runtime import (
    attach_transport_dao_auth,
    bind_dao_runtime_from_meta,
    bind_dao_runtime_from_session,
    copy_dao_auth_to_session,
    detach_transport_dao_auth,
    lookup_transport_dao_auth,
)
from DAO.runtime import get_runtime_context, unbind_hermes_runtime


class _FakeTransport:
    pass


def test_transport_auth_roundtrip():
    transport = _FakeTransport()
    snap = {
        "user_id": str(uuid4()),
        "space_id": str(uuid4()),
        "tier": "solo",
        "mission": "Ship v1",
    }
    attach_transport_dao_auth(transport, snap)
    assert lookup_transport_dao_auth(transport) == snap
    detach_transport_dao_auth(transport)
    assert lookup_transport_dao_auth(transport) is None


def test_copy_and_bind_from_session():
    transport = _FakeTransport()
    user_id = uuid4()
    space_id = uuid4()
    snap = {
        "user_id": str(user_id),
        "space_id": str(space_id),
        "tier": "solo",
        "mission": "Grow revenue",
    }
    attach_transport_dao_auth(transport, snap)
    session: dict = {"transport": transport}
    copy_dao_auth_to_session(session, transport=transport)
    assert session["DAO_auth"] == snap
    assert session["DAO_mission"] == "Grow revenue"

    handle = bind_dao_runtime_from_session(session)
    try:
        ctx = get_runtime_context()
        assert ctx is not None
        assert ctx.user_id == user_id
        assert ctx.space_id == space_id
        assert ctx.mission == "Grow revenue"
    finally:
        unbind_hermes_runtime(handle)


def test_bind_returns_none_without_auth():
    assert bind_dao_runtime_from_session({}) is None
    assert bind_dao_runtime_from_meta({}) is None


def test_bind_from_cron_meta():
    user_id = uuid4()
    space_id = uuid4()
    meta = {
        "user_id": str(user_id),
        "space_id": str(space_id),
        "automation_slug": "morning-briefing",
        "tier": "solo",
    }
    handle = bind_dao_runtime_from_meta(meta)
    try:
        ctx = get_runtime_context()
        assert ctx is not None
        assert ctx.space_id == space_id
    finally:
        unbind_hermes_runtime(handle)
