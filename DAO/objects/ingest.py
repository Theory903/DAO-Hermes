"""Write-through hooks from Drive, HITL, and comms into the Company Graph."""

from __future__ import annotations

from pathlib import PurePosixPath
from uuid import UUID

from DAO.objects import service as graph


def _title_from_path(path: str) -> str:
    name = PurePosixPath(path).name
    return name or path


async def ingest_drive_object(
    conn,
    space_id: UUID,
    *,
    drive_object_id: UUID,
    path: str,
    produced_by_dept: str | None = None,
    source_kind: str = "live",
) -> UUID:
    actor = f"agent:{produced_by_dept}" if produced_by_dept else "system"
    return await graph.ingest_from_source(
        conn,
        space_id,
        source_table="drive_objects",
        source_id=drive_object_id,
        object_type="document",
        title=_title_from_path(path),
        actor=actor,
        event_type="object_created",
        importance=5,
        event_payload={"path": path, "drive_object_id": str(drive_object_id)},
        metadata={"path": path},
        source_kind=source_kind,
    )


async def ingest_hitl_resolved(
    conn,
    space_id: UUID,
    *,
    hitl_id: UUID,
    action_summary: str,
    status: str,
    resolved_by: UUID | None,
    source_kind: str = "live",
) -> UUID:
    object_type = "decision" if status == "approved" else "task"
    event_type = "decision_approved" if status == "approved" else "decision_rejected"
    actor = f"human:{resolved_by}" if resolved_by else "system"

    existing = await graph.lookup_object_by_source(
        conn, space_id, "hitl_requests", hitl_id
    )
    if existing:
        await graph.emit_event(
            conn,
            space_id,
            existing,
            event_type=event_type,
            actor=actor,
            importance=7,
            payload={"hitl_id": str(hitl_id), "status": status, "reconsidered": True},
        )
        return existing

    return await graph.ingest_from_source(
        conn,
        space_id,
        source_table="hitl_requests",
        source_id=hitl_id,
        object_type=object_type,
        title=action_summary[:500] or "HITL resolution",
        actor=actor,
        event_type=event_type,
        importance=7,
        event_payload={"hitl_id": str(hitl_id), "status": status},
        source_kind=source_kind,
    )


async def ingest_interdept_handoff(
    conn,
    space_id: UUID,
    *,
    message_id: UUID,
    subject: str,
    from_dept: str,
    to_dept: str,
    source_kind: str = "live",
) -> UUID:
    title = subject or f"Handoff {from_dept} → {to_dept}"
    return await graph.ingest_from_source(
        conn,
        space_id,
        source_table="interdept_messages",
        source_id=message_id,
        object_type="event",
        title=title[:500],
        actor="system",
        event_type="handoff_completed",
        importance=6,
        event_payload={
            "message_id": str(message_id),
            "from_dept": from_dept,
            "to_dept": to_dept,
        },
        source_kind=source_kind,
    )
