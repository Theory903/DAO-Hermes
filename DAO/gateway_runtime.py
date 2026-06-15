"""Propagate DAO Space auth from the gateway WebSocket into agent worker threads.

``bind_hermes_runtime`` in :mod:`DAO.gateway_ws` runs on the asyncio WS task.
Agent turns execute on plain ``threading.Thread`` workers, which do not inherit
``contextvars``. This module stores a snapshot of the Space bind on the live
:class:`~tui_gateway.ws.WSTransport`, copies it onto gateway sessions at
create/resume time, and re-binds :mod:`DAO.runtime` at the start of each turn.
"""

from __future__ import annotations

import weakref
from typing import Any

from DAO.runtime import HermesBindHandle, bind_hermes_runtime, unbind_hermes_runtime

_transport_auth: weakref.WeakKeyDictionary[Any, dict[str, Any]] = (
    weakref.WeakKeyDictionary()
)


def attach_transport_dao_auth(transport: Any, snapshot: dict[str, Any]) -> None:
    """Associate *snapshot* with *transport* for the lifetime of the WS connection."""
    if transport is None or not snapshot.get("user_id"):
        return
    _transport_auth[transport] = dict(snapshot)


def detach_transport_dao_auth(transport: Any) -> None:
    _transport_auth.pop(transport, None)


def lookup_transport_dao_auth(transport: Any) -> dict[str, Any] | None:
    if transport is None:
        return None
    snap = _transport_auth.get(transport)
    return dict(snap) if snap else None


def copy_dao_auth_to_session(
    session: dict,
    *,
    transport: Any | None = None,
) -> None:
    """Copy DAO bind metadata from the active transport onto *session*."""
    if transport is None:
        from tui_gateway.transport import current_transport

        transport = current_transport()
    if transport is None:
        transport = session.get("transport")
    snap = lookup_transport_dao_auth(transport)
    if not snap:
        session.pop("DAO_auth", None)
        return
    session["DAO_auth"] = snap
    mission = snap.get("mission")
    if mission:
        session["DAO_mission"] = mission


def bind_dao_runtime_from_meta(meta: dict[str, Any]) -> HermesBindHandle | None:
    """Bind Hermes runtime from ``origin.DAO`` cron metadata or a session snapshot."""
    if not isinstance(meta, dict) or not meta.get("user_id") or not meta.get("space_id"):
        return None
    return bind_hermes_runtime(
        user_id=meta["user_id"],
        space_id=meta["space_id"],
        org_id=meta.get("org_id"),
        tier=meta.get("tier") or "solo",
        space_name=meta.get("space_name"),
        lead_name=meta.get("lead_name"),
        mission=meta.get("mission"),
    )


def bind_dao_runtime_from_session(session: dict) -> HermesBindHandle | None:
    """Re-bind Hermes runtime for an agent turn thread from session DAO auth."""
    snap = session.get("DAO_auth")
    if not isinstance(snap, dict):
        return None
    return bind_dao_runtime_from_meta(snap)
