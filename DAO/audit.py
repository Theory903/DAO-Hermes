"""Append-only audit trail for security-sensitive Space actions."""

from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID

import asyncpg

_log = logging.getLogger(__name__)


async def log_audit_event(
    conn: asyncpg.Connection,
    *,
    space_id: UUID,
    actor: str,
    action: str,
    resource: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    try:
        await conn.execute(
            """
            INSERT INTO audit_events (space_id, actor, action, resource, metadata)
            VALUES ($1, $2, $3, $4, $5::jsonb)
            """,
            space_id,
            actor,
            action,
            resource,
            json.dumps(metadata or {}),
        )
    except Exception as exc:
        _log.warning("audit log failed space=%s action=%s: %s", space_id, action, exc)
