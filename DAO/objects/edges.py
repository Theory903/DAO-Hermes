"""Rule-based edge inference (Phase 0 — no LLM)."""

from __future__ import annotations

from uuid import UUID

from DAO.objects import service as graph


async def infer_edges_for_drive_refs(
    conn,
    space_id: UUID,
    *,
    from_object_id: UUID,
    drive_ref_ids: list[UUID],
    edge_type: str = "created_from",
    source: str = "rule:drive_ref",
) -> list[UUID]:
    """Link an object to graph document objects for each drive ref."""
    created: list[UUID] = []
    for drive_id in drive_ref_ids:
        target = await graph.lookup_object_by_source(
            conn, space_id, "drive_objects", drive_id
        )
        if target is None:
            continue
        edge_id = await graph.add_edge(
            conn,
            space_id,
            from_object_id=from_object_id,
            to_object_id=target,
            edge_type=edge_type,
            source=source,
        )
        if edge_id:
            created.append(edge_id)
    return created


async def infer_edges_for_source(
    conn,
    space_id: UUID,
    *,
    source_table: str,
    source_id: UUID,
    drive_ref_ids: list[UUID] | None = None,
) -> list[UUID]:
    """Post-commit rule pass for a source row with optional drive_refs."""
    object_id = await graph.lookup_object_by_source(
        conn, space_id, source_table, source_id
    )
    if object_id is None or not drive_ref_ids:
        return []
    return await infer_edges_for_drive_refs(
        conn,
        space_id,
        from_object_id=object_id,
        drive_ref_ids=drive_ref_ids,
    )
