"""Idempotent historical ingest into the Company Graph (Phase 0)."""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

from DAO.objects import service as graph
from DAO.objects.ingest import (
    ingest_drive_object,
    ingest_hitl_resolved,
    ingest_interdept_handoff,
)


@dataclass
class BackfillStats:
    drive: int = 0
    brain_entities: int = 0
    hitl: int = 0
    interdept: int = 0
    briefings: int = 0
    skipped: int = 0

    def total_ingested(self) -> int:
        return self.drive + self.brain_entities + self.hitl + self.interdept + self.briefings


async def backfill_space(conn, space_id: UUID) -> BackfillStats:
    """
    Replay source rows into space_objects + object_events.
    Safe to run 1×, 2×, or 10× — ingest_from_source is idempotent.
    """
    stats = BackfillStats()

    drive_rows = await conn.fetch(
        """
        SELECT id, path, produced_by_dept
        FROM drive_objects
        WHERE space_id = $1
        ORDER BY created_at ASC
        """,
        space_id,
    )
    for row in drive_rows:
        before = await graph.lookup_object_by_source(
            conn, space_id, "drive_objects", row["id"]
        )
        await ingest_drive_object(
            conn,
            space_id,
            drive_object_id=row["id"],
            path=row["path"],
            produced_by_dept=row["produced_by_dept"],
        )
        if before is None:
            stats.drive += 1
        else:
            stats.skipped += 1

    brain_rows = await conn.fetch(
        """
        SELECT id, title, slug
        FROM brain_entities
        WHERE space_id = $1
        ORDER BY updated_at ASC
        """,
        space_id,
    )
    for row in brain_rows:
        before = await graph.lookup_object_by_source(
            conn, space_id, "brain_entities", row["id"]
        )
        await graph.ingest_from_source(
            conn,
            space_id,
            source_table="brain_entities",
            source_id=row["id"],
            object_type="document",
            title=row["title"] or row["slug"],
            actor="system",
            event_type="object_created",
            importance=5,
            event_payload={"slug": row["slug"], "brain_entity_id": str(row["id"])},
            metadata={"slug": row["slug"]},
            source_kind="backfill",
        )
        if before is None:
            stats.brain_entities += 1
        else:
            stats.skipped += 1

    hitl_rows = await conn.fetch(
        """
        SELECT id, action_summary, status, resolved_by
        FROM hitl_requests
        WHERE space_id = $1 AND status IN ('approved', 'rejected')
        ORDER BY created_at ASC
        """,
        space_id,
    )
    for row in hitl_rows:
        before = await graph.lookup_object_by_source(
            conn, space_id, "hitl_requests", row["id"]
        )
        await ingest_hitl_resolved(
            conn,
            space_id,
            hitl_id=row["id"],
            action_summary=row["action_summary"],
            status=row["status"],
            resolved_by=row["resolved_by"],
            source_kind="backfill",
        )
        if before is None:
            stats.hitl += 1
        else:
            stats.skipped += 1

    msg_rows = await conn.fetch(
        """
        SELECT id, subject, from_dept, to_dept
        FROM interdept_messages
        WHERE space_id = $1
        ORDER BY created_at ASC
        """,
        space_id,
    )
    for row in msg_rows:
        before = await graph.lookup_object_by_source(
            conn, space_id, "interdept_messages", row["id"]
        )
        await ingest_interdept_handoff(
            conn,
            space_id,
            message_id=row["id"],
            subject=row["subject"],
            from_dept=row["from_dept"],
            to_dept=row["to_dept"],
            source_kind="backfill",
        )
        if before is None:
            stats.interdept += 1
        else:
            stats.skipped += 1

    briefing_rows = await conn.fetch(
        """
        SELECT id, markdown, generated_at, trigger_source
        FROM jarvis_briefings
        WHERE space_id = $1
        ORDER BY generated_at ASC
        """,
        space_id,
    )
    for row in briefing_rows:
        before = await graph.lookup_object_by_source(
            conn, space_id, "jarvis_briefings", row["id"]
        )
        title = _briefing_title(row["markdown"], row["generated_at"])
        await graph.ingest_from_source(
            conn,
            space_id,
            source_table="jarvis_briefings",
            source_id=row["id"],
            object_type="event",
            title=title,
            actor="system",
            event_type="briefing_generated",
            importance=6,
            event_payload={
                "briefing_id": str(row["id"]),
                "trigger_source": row["trigger_source"],
            },
            source_kind="backfill",
        )
        if before is None:
            stats.briefings += 1
        else:
            stats.skipped += 1

    return stats


def _briefing_title(markdown: str, generated_at) -> str:
    for line in markdown.splitlines():
        stripped = line.strip().lstrip("#").strip()
        if stripped:
            return stripped[:500]
    return f"Jarvis briefing {generated_at:%Y-%m-%d}"
