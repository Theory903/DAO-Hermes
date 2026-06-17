"""Attach cached or generated home greeting to API payloads."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import Request

from DAO.auth.repository import fetch_user_profile, update_user_profile
from DAO.auth.profile import (
    greeting_cache_day,
    greeting_cache_patch,
    read_greeting_cache,
)
from DAO.db import admin_connection
from DAO.deps import current_user_id
from DAO.jarvis import briefing as briefing_svc
from DAO.jarvis.greeting import build_home_greeting, generate_home_greeting

logger = logging.getLogger(__name__)


async def attach_home_greeting(
    conn,
    space_id: UUID,
    request: Request,
    payload: dict,
) -> dict:
    row = await conn.fetchrow(
        "SELECT name, ai_lead_config FROM spaces WHERE id = $1",
        space_id,
    )
    cfg = row["ai_lead_config"] if row else {}
    if isinstance(cfg, str):
        cfg = json.loads(cfg)
    lead = (cfg or {}).get("name") or "Jarvis"
    space_name = (row["name"] if row else None) or "your Space"
    user_id = current_user_id(request)
    now = datetime.now(timezone.utc)
    day = greeting_cache_day(now)

    async with admin_connection() as admin_conn:
        profile = await fetch_user_profile(admin_conn, user_id)
        row_user = await admin_conn.fetchrow(
            "SELECT preferences FROM users WHERE id = $1",
            user_id,
        )
        preferences_blob = row_user["preferences"] if row_user else {}

        cached = read_greeting_cache(preferences_blob, space_id=str(space_id), day=day)
        display = (profile or {}).get("display_name") or (profile or {}).get("email", "").split("@")[0]
        birthday = (profile or {}).get("birthday_mm_dd")

        if cached:
            ai_greeting = cached
        else:
            pulse = await briefing_svc.fetch_space_pulse(conn, space_id)
            ai_greeting = await generate_home_greeting(
                display_name=display,
                lead_name=lead,
                space_name=space_name,
                birthday_mm_dd=birthday,
                now=now,
                context=pulse,
            )
            cache_patch = greeting_cache_patch(
                preferences_blob,
                space_id=str(space_id),
                day=day,
                greeting=ai_greeting,
            )
            try:
                await update_user_profile(
                    admin_conn,
                    user_id,
                    preferences_patch=cache_patch,
                )
            except Exception:
                logger.exception("Failed to persist greeting cache for user %s", user_id)

    payload.update(build_home_greeting(ai_greeting=ai_greeting, display_name=display, lead_name=lead))
    return payload
