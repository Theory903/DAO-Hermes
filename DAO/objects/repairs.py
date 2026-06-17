"""graph_repairs queue — recoverable post-commit failures (Phase 0)."""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from DAO.objects.edges import infer_edges_for_source


async def enqueue_repair(
    conn,
    space_id: UUID,
    *,
    repair_kind: str,
    payload: dict[str, Any],
    last_error: str | None = None,
) -> UUID:
    return await conn.fetchval(
        """
        INSERT INTO graph_repairs (space_id, repair_kind, payload, last_error)
        VALUES ($1, $2, $3::jsonb, $4)
        RETURNING id
        """,
        space_id,
        repair_kind,
        json.dumps(payload),
        last_error,
    )


async def process_pending_repairs(
    conn,
    space_id: UUID,
    *,
    limit: int = 20,
) -> int:
    """Retry pending repairs; returns count successfully processed."""
    rows = await conn.fetch(
        """
        SELECT id, repair_kind, payload
        FROM graph_repairs
        WHERE space_id = $1 AND attempts < 5
        ORDER BY created_at ASC
        LIMIT $2
        """,
        space_id,
        limit,
    )
    done = 0
    for row in rows:
        try:
            if row["repair_kind"] == "infer_edges":
                payload = row["payload"]
                if isinstance(payload, str):
                    payload = json.loads(payload)
                drive_refs = [UUID(x) for x in payload.get("drive_ref_ids", [])]
                await infer_edges_for_source(
                    conn,
                    space_id,
                    source_table=payload["source_table"],
                    source_id=UUID(payload["source_id"]),
                    drive_ref_ids=drive_refs,
                )
            await conn.execute(
                "DELETE FROM graph_repairs WHERE id = $1 AND space_id = $2",
                row["id"],
                space_id,
            )
            done += 1
        except Exception as exc:
            await conn.execute(
                """
                UPDATE graph_repairs
                SET attempts = attempts + 1, last_error = $3, updated_at = now()
                WHERE id = $1 AND space_id = $2
                """,
                row["id"],
                space_id,
                str(exc),
            )
    return done


async def infer_edges_safe(
    conn,
    space_id: UUID,
    *,
    source_table: str,
    source_id: UUID,
    drive_ref_ids: list[UUID] | None = None,
) -> list[UUID]:
    """Run rule inference; enqueue graph_repairs on failure."""
    try:
        return await infer_edges_for_source(
            conn,
            space_id,
            source_table=source_table,
            source_id=source_id,
            drive_ref_ids=drive_ref_ids,
        )
    except Exception as exc:
        await enqueue_repair(
            conn,
            space_id,
            repair_kind="infer_edges",
            payload={
                "source_table": source_table,
                "source_id": str(source_id),
                "drive_ref_ids": [str(x) for x in (drive_ref_ids or [])],
            },
            last_error=str(exc),
        )
        return []
