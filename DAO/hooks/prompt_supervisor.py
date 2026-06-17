"""Inject DAO supervisor routing into Hermes prompt.submit turns."""

from __future__ import annotations

import logging
from typing import Any

from DAO.config import DAO_enabled
from DAO.jarvis.supervisor import (
    Supervisor,
    build_prompt_injection,
    routing_payload,
    strip_supervisor_block,
)
from DAO.runtime import get_runtime_context

_log = logging.getLogger(__name__)


def apply_DAO_supervisor_routing(
    prompt: str,
    *,
    mission: str = "",
) -> tuple[str, dict[str, Any] | None]:
    """Classify department and prepend AI Lead routing context to the user prompt.

    Returns ``(enriched_prompt, routing_payload_or_none)``. No-op when DAO is
    disabled or no Space runtime is bound (e.g. plain Hermes desktop).
    """
    if not DAO_enabled():
        return prompt, None
    if not isinstance(prompt, str) or not prompt.strip():
        return prompt, None

    ctx = get_runtime_context()
    if ctx is None or ctx.space_id is None:
        return prompt, None

    clean_prompt = strip_supervisor_block(prompt)
    mission_text = (mission or "").strip() or (ctx.mission or "").strip()
    state = Supervisor().run(user_message=clean_prompt, mission=mission_text)
    injection = build_prompt_injection(state)
    payload = routing_payload(state)
    payload["space_id"] = str(ctx.space_id)
    return injection + clean_prompt, payload


def maybe_publish_supervisor_route(payload: dict[str, Any] | None) -> None:
    """Fire-and-forget Command Center event when routing completes."""
    if not payload:
        return
    space_id = payload.get("space_id")
    if not space_id:
        return
    try:
        from uuid import UUID

        from DAO.comms import events as event_bus
        from DAO.db import schedule_fire_and_forget

        schedule_fire_and_forget(
            event_bus.publish(
                UUID(str(space_id)),
                "supervisor.route",
                {k: v for k, v in payload.items() if k != "space_id"},
            )
        )
    except Exception as exc:
        _log.debug("supervisor.route publish skipped: %s", exc)
