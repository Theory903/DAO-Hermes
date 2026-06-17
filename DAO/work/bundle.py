"""Work lens aggregate — focus, active work, operations, activity."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any
from uuid import UUID

if TYPE_CHECKING:
    import asyncpg

from DAO.jarvis import home as home_svc

OPERATION_VERBS = (
    {"key": "researching", "label": "Researching"},
    {"key": "deciding", "label": "Deciding"},
    {"key": "building", "label": "Building"},
    {"key": "shipping", "label": "Shipping"},
)

_EVENT_VERB: dict[str, str] = {
    "hitl_resolved": "deciding",
    "decision_approved": "deciding",
    "decision_reconsidered": "deciding",
    "handoff_completed": "shipping",
    "object_merged": "shipping",
    "playbook_run": "shipping",
    "outcome_recorded": "shipping",
}

_OBJECT_VERB: dict[str, str] = {
    "decision": "deciding",
    "document": "researching",
    "project": "building",
    "task": "building",
    "meeting": "deciding",
    "conversation": "researching",
    "event": "shipping",
    "customer": "building",
}


def _truncate(text: str, limit: int = 100) -> str:
    raw = " ".join((text or "").split())
    if len(raw) <= limit:
        return raw
    return raw[: limit - 3].rstrip() + "..."


def _payload_dict(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def verb_for_event(event_type: str, object_type: str) -> str:
    if event_type in _EVENT_VERB:
        return _EVENT_VERB[event_type]
    if object_type in _OBJECT_VERB:
        return _OBJECT_VERB[object_type]
    if event_type in ("object_created", "object_updated"):
        return "building"
    return "building"


def event_headline(event_type: str) -> str:
    labels = {
        "object_created": "Created",
        "object_updated": "Updated",
        "hitl_resolved": "Decision resolved",
        "handoff_completed": "Handoff",
        "decision_reconsidered": "Decision reopened",
        "object_linked": "Linked",
        "object_merged": "Merged",
        "playbook_run": "Automation run",
        "outcome_recorded": "Outcome recorded",
    }
    return labels.get(event_type, event_type.replace("_", " ").title())


async def fetch_focus_queue(
    conn: asyncpg.Connection,
    space_id: UUID,
    *,
    preferences: Any = None,
    limit: int = 8,
) -> list[dict[str, Any]]:
    from DAO.jarvis.briefing import fetch_space_pulse

    pulse = await fetch_space_pulse(conn, space_id)
    snoozed = home_svc.active_snoozed_ids(preferences)
    hitl_rows = await home_svc.fetch_pending_hitl_rows(conn, space_id, snoozed_ids=snoozed)
    cards = [home_svc.hitl_row_to_focus_card(dict(r), pulse) for r in hitl_rows]

    decision_rows = await conn.fetch(
        """
        SELECT id, title, status, metadata, updated_at
        FROM space_objects
        WHERE space_id = $1
          AND object_type = 'decision'
          AND status = 'pending'
          AND merged_into_id IS NULL
        ORDER BY updated_at DESC
        LIMIT $2
        """,
        space_id,
        max(1, limit - len(cards)),
    )
    for row in decision_rows:
        cards.append(
            {
                "id": str(row["id"]),
                "kind": "decision",
                "title": _truncate(str(row["title"]), 80),
                "context": str(row["title"]),
                "recommendation": None,
                "why_this_matters": "Open decision blocking downstream work.",
                "impact": "high",
                "time_estimate": "3 min",
                "confidence": 0.8,
                "tool_trace": {},
                "drive_refs": [],
                "object_id": str(row["id"]),
            }
        )
    return cards[:limit]


async def fetch_active_work(
    conn: asyncpg.Connection,
    space_id: UUID,
    *,
    limit: int = 12,
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT o.id, o.object_type, o.title, o.status, o.metadata, o.updated_at,
               (
                   SELECT event_type FROM object_events e
                   WHERE e.space_id = o.space_id AND e.object_id = o.id
                   ORDER BY e.created_at DESC
                   LIMIT 1
               ) AS last_event_type
        FROM space_objects o
        WHERE o.space_id = $1
          AND o.merged_into_id IS NULL
          AND o.status = 'active'
          AND o.object_type IN ('project', 'task', 'decision')
        ORDER BY o.updated_at DESC
        LIMIT $2
        """,
        space_id,
        limit,
    )
    streams: list[dict[str, Any]] = []
    for row in rows:
        meta = _payload_dict(row["metadata"])
        streams.append(
            {
                "object_id": str(row["id"]),
                "object_type": row["object_type"],
                "title": row["title"],
                "status": row["status"],
                "verb": verb_for_event(str(row["last_event_type"] or "object_updated"), row["object_type"]),
                "outcome_hint": meta.get("outcome") or meta.get("goal"),
                "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            }
        )

    if len(streams) < limit:
        handoffs = await conn.fetch(
            """
            SELECT o.id, o.title, o.metadata, o.updated_at
            FROM space_objects o
            WHERE o.space_id = $1
              AND o.object_type = 'event'
              AND o.source_table = 'interdept_messages'
              AND o.merged_into_id IS NULL
            ORDER BY o.updated_at DESC
            LIMIT $2
            """,
            space_id,
            limit - len(streams),
        )
        for row in handoffs:
            meta = _payload_dict(row["metadata"])
            streams.append(
                {
                    "object_id": str(row["id"]),
                    "object_type": "handoff",
                    "title": row["title"],
                    "status": "active",
                    "verb": "shipping",
                    "outcome_hint": meta.get("subject") or meta.get("to_dept"),
                    "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
                }
            )
    return streams[:limit]


async def fetch_operations_snapshot(
    conn: asyncpg.Connection,
    space_id: UUID,
    *,
    hours: int = 24,
    per_verb: int = 4,
) -> dict[str, Any]:
    rows = await conn.fetch(
        """
        SELECT e.event_type, e.importance, e.created_at, e.payload,
               o.id AS object_id, o.title, o.object_type
        FROM object_events e
        JOIN space_objects o ON o.id = e.object_id AND o.space_id = e.space_id
        WHERE e.space_id = $1
          AND e.created_at > now() - make_interval(hours => $2)
          AND o.merged_into_id IS NULL
        ORDER BY e.importance DESC, e.created_at DESC
        LIMIT 80
        """,
        space_id,
        hours,
    )

    lanes: dict[str, list[dict[str, Any]]] = {v["key"]: [] for v in OPERATION_VERBS}
    seen: set[str] = set()

    for row in rows:
        verb = verb_for_event(row["event_type"], row["object_type"])
        oid = str(row["object_id"])
        dedupe_key = f"{verb}:{oid}"
        if dedupe_key in seen:
            continue
        if len(lanes[verb]) >= per_verb:
            continue
        seen.add(dedupe_key)
        lanes[verb].append(
            {
                "object_id": oid,
                "title": row["title"],
                "object_type": row["object_type"],
                "event_type": row["event_type"],
                "headline": event_headline(row["event_type"]),
                "importance": int(row["importance"]),
                "at": row["created_at"].isoformat() if row["created_at"] else None,
            }
        )

    return {
        "verbs": list(OPERATION_VERBS),
        "lanes": lanes,
        "window_hours": hours,
    }


async def fetch_activity_feed(
    conn: asyncpg.Connection,
    space_id: UUID,
    *,
    importance_gte: int = 5,
    limit: int = 30,
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT e.*, o.title AS object_title, o.object_type
        FROM object_events e
        JOIN space_objects o ON o.id = e.object_id AND o.space_id = e.space_id
        WHERE e.space_id = $1
          AND e.importance >= $2
          AND o.merged_into_id IS NULL
        ORDER BY e.importance DESC, e.created_at DESC
        LIMIT $3
        """,
        space_id,
        importance_gte,
        limit,
    )
    return [
        {
            "id": str(row["id"]),
            "object_id": str(row["object_id"]),
            "object_type": row["object_type"],
            "object_title": row["object_title"],
            "event_type": row["event_type"],
            "importance": int(row["importance"]),
            "headline": event_headline(row["event_type"]),
            "actor": row["actor"],
            "payload": _payload_dict(row["payload"]),
            "at": row["created_at"].isoformat() if row["created_at"] else None,
        }
        for row in rows
    ]


async def fetch_active_projects(
    conn: asyncpg.Connection,
    space_id: UUID,
    *,
    limit: int = 20,
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT id, title, status, metadata, updated_at, created_at
        FROM space_objects
        WHERE space_id = $1
          AND object_type = 'project'
          AND merged_into_id IS NULL
          AND status IN ('active', 'pending')
        ORDER BY updated_at DESC
        LIMIT $2
        """,
        space_id,
        limit,
    )
    return [
        {
            "id": str(row["id"]),
            "title": row["title"],
            "status": row["status"],
            "metadata": _payload_dict(row["metadata"]),
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        }
        for row in rows
    ]


async def fetch_floor_snapshot(conn: asyncpg.Connection, space_id: UUID) -> dict[str, Any]:
    """Live floor state (formerly ``GET /command/snapshot``)."""
    from DAO.comms import events as event_bus

    agents = await conn.fetch(
        """
        SELECT department, agent_type, name FROM agents
        WHERE space_id = $1 AND agent_type IN ('ai_lead', 'lead')
        ORDER BY department
        """,
        space_id,
    )
    pending_hitl = await conn.fetchval(
        "SELECT count(*) FROM hitl_requests WHERE space_id = $1 AND status = 'pending'",
        space_id,
    )
    recent = await conn.fetch(
        """
        SELECT from_dept, to_dept, subject, created_at FROM interdept_messages
        WHERE space_id = $1 ORDER BY created_at DESC LIMIT 10
        """,
        space_id,
    )
    depts = await event_bus.dept_status_for_space(conn, space_id)
    return {
        "ai_lead": next((a["name"] for a in agents if a["agent_type"] == "ai_lead"), "Jarvis"),
        "departments": depts,
        "pending_hitl": pending_hitl,
        "recent_handoffs": [dict(r) for r in recent],
    }


async def build_work_bundle(
    conn: asyncpg.Connection,
    space_id: UUID,
    *,
    preferences: Any = None,
) -> dict[str, Any]:
    focus = await fetch_focus_queue(conn, space_id, preferences=preferences)
    return {
        "focus": focus,
        "focus_primary": focus[0] if focus else None,
        "also_attention": focus[1:4],
        "active_work": await fetch_active_work(conn, space_id),
        "operations": await fetch_operations_snapshot(conn, space_id),
        "activity": await fetch_activity_feed(conn, space_id),
        "projects": await fetch_active_projects(conn, space_id),
        "floor": await fetch_floor_snapshot(conn, space_id),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
