"""Hybrid keyword search over space_objects (vector hook point for Phase 2+)."""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID


async def search_memory(
    conn,
    space_id: UUID,
    q: str,
    *,
    object_type: str | None = None,
    status: str | None = None,
    limit: int = 25,
) -> list[dict[str, Any]]:
    """Keyword + metadata search; ranks by title match then recency."""
    term = (q or "").strip()
    clauses = ["o.space_id = $1", "o.merged_into_id IS NULL"]
    args: list[Any] = [space_id]
    n = 2

    if object_type:
        clauses.append(f"o.object_type = ${n}")
        args.append(object_type)
        n += 1
    if status:
        clauses.append(f"o.status = ${n}")
        args.append(status)
        n += 1

    pattern_idx: int | None = None
    if term:
        pattern_idx = n
        clauses.append(
            f"(o.title ILIKE ${n} OR o.metadata::text ILIKE ${n} "
            f"OR COALESCE(d.path, '') ILIKE ${n})"
        )
        args.append(f"%{term}%")
        n += 1
        rank_expr = f"""
            CASE
                WHEN o.title ILIKE ${pattern_idx} THEN 3
                WHEN o.metadata::text ILIKE ${pattern_idx} THEN 2
                ELSE 1
            END
        """
    else:
        rank_expr = "1"

    args.append(limit)
    where = " AND ".join(clauses)
    rows = await conn.fetch(
        f"""
        SELECT o.*, {rank_expr} AS match_rank,
               d.path AS drive_path
        FROM space_objects o
        LEFT JOIN drive_objects d
          ON o.source_table = 'drive_objects' AND o.source_id = d.id AND d.space_id = o.space_id
        WHERE {where}
        ORDER BY match_rank DESC, o.updated_at DESC
        LIMIT ${n}
        """,
        *args,
    )

    results: list[dict[str, Any]] = []
    for row in rows:
        meta = row["metadata"]
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except json.JSONDecodeError:
                meta = {}
        item = dict(row)
        item["metadata"] = meta or {}
        item["match_rank"] = int(row["match_rank"])
        if row.get("drive_path"):
            item["drive_path"] = row["drive_path"]
        results.append(item)
    return results
