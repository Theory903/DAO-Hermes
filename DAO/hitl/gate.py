"""Register DAO HITL gate on Hermes pre_tool_call hooks."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from DAO.config import DAO_enabled
from DAO.db import rls_standalone, run_sync
from DAO.hitl.policy import HitlMatch, evaluate_hitl_policy
from DAO.runtime import get_runtime_context

_log = logging.getLogger(__name__)

_REGISTERED = False
_APPROVAL_TTL = timedelta(hours=1)


def register_hitl_gate() -> None:
    """Attach pre_tool_call blocker when DAO API is enabled."""
    global _REGISTERED
    if _REGISTERED or not DAO_enabled():
        return
    try:
        from hermes_cli.plugins import get_plugin_manager

        mgr = get_plugin_manager()
        mgr.register_core_hook("pre_tool_call", _pre_tool_hitl)
        _REGISTERED = True
        _log.info("DAO HITL pre_tool_call gate registered")
    except Exception as exc:
        _log.warning("DAO HITL gate registration failed: %s", exc)


def _pre_tool_hitl(
    tool_name: str,
    args: dict | None = None,
    **kwargs: Any,
) -> dict[str, str] | None:
    if not DAO_enabled():
        return None
    ctx = get_runtime_context()
    if ctx is None or ctx.space_id is None:
        return None

    tool_call_id = str(kwargs.get("tool_call_id") or "")
    try:
        policy = run_sync(_load_hitl_policy(ctx.space_id, ctx.user_id))
        match = evaluate_hitl_policy(tool_name, args, policy)
        if match is None:
            return None

        if run_sync(_is_recently_approved(ctx.space_id, ctx.user_id, match.fingerprint)):
            return None

        request_id = run_sync(
            _ensure_pending_request(
                ctx.space_id,
                ctx.user_id,
                match,
                tool_name,
                args or {},
                tool_call_id=tool_call_id,
            )
        )
        msg = (
            f"HITL approval required ({match.policy_key}): {match.action_summary}. "
            "Open Inbox to approve or reject."
        )
        if request_id:
            msg += f" [hitl:{request_id}]"
        return {"action": "block", "message": msg}
    except Exception as exc:
        _log.debug("DAO HITL gate skipped: %s", exc)
        return None


async def _load_hitl_policy(space_id: UUID, user_id: UUID) -> dict[str, Any]:
    async with rls_standalone(space_id=space_id, user_id=user_id) as conn:
        raw = await conn.fetchval(
            "SELECT ai_lead_config FROM spaces WHERE id = $1",
            space_id,
        )
    if raw is None:
        return {}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return {}
    if not isinstance(raw, dict):
        return {}
    policy = raw.get("hitl_policy")
    return policy if isinstance(policy, dict) else {}


async def _is_recently_approved(space_id: UUID, user_id: UUID, fingerprint: str) -> bool:
    cutoff = datetime.now(timezone.utc) - _APPROVAL_TTL
    async with rls_standalone(space_id=space_id, user_id=user_id) as conn:
        row = await conn.fetchrow(
            """
            SELECT id FROM hitl_requests
            WHERE space_id = $1
              AND status = 'approved'
              AND resolved_at >= $2
              AND tool_trace->>'fingerprint' = $3
            ORDER BY resolved_at DESC
            LIMIT 1
            """,
            space_id,
            cutoff,
            fingerprint,
        )
    return row is not None


async def _ensure_pending_request(
    space_id: UUID,
    user_id: UUID,
    match: HitlMatch,
    tool_name: str,
    args: dict,
    *,
    tool_call_id: str,
) -> str | None:
    from DAO.comms import events as event_bus

    trace = {
        "fingerprint": match.fingerprint,
        "policy_key": match.policy_key,
        "tool": tool_name,
        "tool_call_id": tool_call_id,
        "args": {k: args[k] for k in list(args.keys())[:12]},
    }
    async with rls_standalone(space_id=space_id, user_id=user_id) as conn:
        existing = await conn.fetchval(
            """
            SELECT id FROM hitl_requests
            WHERE space_id = $1
              AND status = 'pending'
              AND tool_trace->>'fingerprint' = $2
            LIMIT 1
            """,
            space_id,
            match.fingerprint,
        )
        if existing:
            return str(existing)

        rid = await conn.fetchval(
            """
            INSERT INTO hitl_requests (
                space_id, action_summary, tool_trace, status
            ) VALUES ($1, $2, $3::jsonb, 'pending')
            RETURNING id
            """,
            space_id,
            match.action_summary,
            json.dumps(trace),
        )

    await event_bus.publish(
        space_id,
        "hitl_pending",
        {
            "id": str(rid),
            "summary": match.action_summary,
            "policy_key": match.policy_key,
            "tool": tool_name,
        },
    )
    return str(rid)
