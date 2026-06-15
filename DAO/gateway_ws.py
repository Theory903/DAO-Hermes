"""DAO integration with the Hermes in-process JSON-RPC gateway (/api/ws)."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from DAO.config import DAO_enabled
from DAO.db import admin_connection
from DAO.runtime import bind_hermes_runtime, unbind_hermes_runtime
from DAO.spaces.prompt_meta import space_prompt_meta_from_row

if TYPE_CHECKING:
    from starlette.websocket import WebSocket


def try_DAO_ws_auth(ws: "WebSocket", ticket: str) -> bool:
    if not DAO_enabled() or not ticket:
        return False
    try:
        from DAO.auth.ws_ticket import consume_ws_ticket

        info = consume_ws_ticket(ticket)
    except Exception:
        return False
    ws.state.DAO_space_id = info["space_id"]
    ws.state.DAO_user_id = info["user_id"]
    return True


async def _space_bind_context(space_id: str) -> tuple[str, UUID | None, dict[str, str | None]]:
    async with admin_connection() as conn:
        row = await conn.fetchrow(
            """
            SELECT tier, org_id, name, ai_lead_config
            FROM spaces WHERE id = $1
            """,
            UUID(space_id),
        )
    if row is None:
        return "solo", None, space_prompt_meta_from_row(None)
    meta = space_prompt_meta_from_row(row)
    return str(row["tier"]), row["org_id"], meta


async def handle_gateway_ws(ws: "WebSocket", handle_ws) -> None:
    bind = None
    space_id = getattr(ws.state, "DAO_space_id", None)
    user_id = getattr(ws.state, "DAO_user_id", None)
    if DAO_enabled() and user_id:
        tier, org_id = ("solo", None)
        meta: dict[str, str | None] = space_prompt_meta_from_row(None)
        if space_id:
            tier, org_id, meta = await _space_bind_context(str(space_id))
        ws.state.DAO_bind_snapshot = {
            "user_id": str(user_id),
            "space_id": str(space_id) if space_id else None,
            "org_id": str(org_id) if org_id else None,
            "tier": tier,
            "space_name": meta.get("space_name"),
            "lead_name": meta.get("lead_name"),
            "mission": meta.get("mission"),
        }
        bind = bind_hermes_runtime(
            user_id=user_id,
            space_id=space_id,
            org_id=org_id,
            tier=tier,
            space_name=meta.get("space_name"),
            lead_name=meta.get("lead_name"),
            mission=meta.get("mission"),
        )
    try:
        await handle_ws(ws)
    finally:
        unbind_hermes_runtime(bind)
