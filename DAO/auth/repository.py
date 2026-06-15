"""User profile persistence."""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import asyncpg

from DAO.auth.profile import merge_preferences, user_profile_payload


def _preferences_jsonb(preferences: Any) -> str:
    """asyncpg + ``$n::jsonb`` expects a JSON string, not a Python dict."""
    if isinstance(preferences, str):
        return preferences
    return json.dumps(preferences or {}, default=str)


async def fetch_user_profile(conn: asyncpg.Connection, user_id: UUID) -> dict | None:
    row = await conn.fetchrow(
        "SELECT id, email, display_name, preferences FROM users WHERE id = $1",
        user_id,
    )
    if row is None:
        return None
    return user_profile_payload(
        user_id=row["id"],
        email=str(row["email"]),
        display_name=row["display_name"],
        preferences=row["preferences"],
    )


async def update_user_profile(
    conn: asyncpg.Connection,
    user_id: UUID,
    *,
    display_name: str | None = None,
    display_name_set: bool = False,
    preferences_patch: dict | None = None,
) -> dict:
    row = await conn.fetchrow(
        "SELECT id, email, display_name, preferences FROM users WHERE id = $1",
        user_id,
    )
    if row is None:
        raise LookupError("user not found")

    next_display = row["display_name"]
    if display_name_set:
        cleaned = (display_name or "").strip()
        next_display = cleaned or None

    next_preferences = row["preferences"]
    if preferences_patch is not None:
        next_preferences = merge_preferences(row["preferences"], preferences_patch)

    await conn.execute(
        """
        UPDATE users
        SET display_name = $2, preferences = $3::jsonb
        WHERE id = $1
        """,
        user_id,
        next_display,
        _preferences_jsonb(next_preferences),
    )

    return user_profile_payload(
        user_id=row["id"],
        email=str(row["email"]),
        display_name=next_display,
        preferences=next_preferences,
    )
