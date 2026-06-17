"""Company Graph ingest, timeline, related, merge."""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import asyncpg

from DAO.exceptions import NotFoundError, ValidationError
from DAO.objects.constants import EDGE_TYPES, OBJECT_TYPES, OBJECT_STATUSES


async def _fetch_object(conn, space_id: UUID, object_id: UUID) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        SELECT * FROM space_objects
        WHERE space_id = $1 AND id = $2
        """,
        space_id,
        object_id,
    )


async def resolve_canonical_object_id(conn, space_id: UUID, object_id: UUID) -> UUID:
    """Follow merged_into_id chain to survivor."""
    current = object_id
    for _ in range(32):
        row = await conn.fetchrow(
            """
            SELECT id, merged_into_id FROM space_objects
            WHERE space_id = $1 AND id = $2
            """,
            space_id,
            current,
        )
        if not row:
            raise NotFoundError("Space object not found")
        if row["merged_into_id"] is None:
            return row["id"]
        current = row["merged_into_id"]
    raise ValidationError("Merge chain too deep")


async def object_id_chain(conn, space_id: UUID, object_id: UUID) -> list[UUID]:
    """Survivor id plus archived objects merged into it (for timeline aggregation)."""
    canonical = await resolve_canonical_object_id(conn, space_id, object_id)
    rows = await conn.fetch(
        """
        SELECT id FROM space_objects
        WHERE space_id = $1 AND (id = $2 OR merged_into_id = $2)
        ORDER BY created_at ASC
        """,
        space_id,
        canonical,
    )
    return [r["id"] for r in rows]


async def emit_event(
    conn,
    space_id: UUID,
    object_id: UUID,
    *,
    event_type: str,
    actor: str = "system",
    importance: int = 5,
    payload: dict[str, Any] | None = None,
    caused_by_event_id: UUID | None = None,
) -> UUID:
    """Append-only event insert."""
    importance = max(0, min(10, importance))
    return await conn.fetchval(
        """
        INSERT INTO object_events (
            space_id, object_id, event_type, importance, payload, actor, caused_by_event_id
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
        RETURNING id
        """,
        space_id,
        object_id,
        event_type,
        importance,
        json.dumps(payload or {}),
        actor,
        caused_by_event_id,
    )


async def ingest_from_source(
    conn,
    space_id: UUID,
    *,
    source_table: str,
    source_id: UUID,
    object_type: str,
    title: str,
    actor: str = "system",
    event_type: str = "object_created",
    importance: int = 5,
    metadata: dict[str, Any] | None = None,
    event_payload: dict[str, Any] | None = None,
    source_kind: str = "live",
) -> UUID:
    """
    Idempotent ingest: one object per (space_id, source_table, source_id).
    Emits event only on first insert — safe to replay.
    """
    if object_type not in OBJECT_TYPES:
        raise ValidationError(f"Invalid object_type: {object_type}")

    existing = await conn.fetchval(
        """
        SELECT id FROM space_objects
        WHERE space_id = $1 AND source_table = $2 AND source_id = $3
        """,
        space_id,
        source_table,
        source_id,
    )
    if existing:
        return existing

    object_id = await conn.fetchval(
        """
        INSERT INTO space_objects (
            space_id, object_type, title, metadata,
            source_table, source_id, source_kind
        ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
        RETURNING id
        """,
        space_id,
        object_type,
        title,
        json.dumps(metadata or {}),
        source_table,
        source_id,
        source_kind,
    )
    await emit_event(
        conn,
        space_id,
        object_id,
        event_type=event_type,
        actor=actor,
        importance=importance,
        payload=event_payload or {"title": title, "source_table": source_table},
    )
    return object_id


async def lookup_object_by_source(
    conn,
    space_id: UUID,
    source_table: str,
    source_id: UUID,
) -> UUID | None:
    return await conn.fetchval(
        """
        SELECT id FROM space_objects
        WHERE space_id = $1 AND source_table = $2 AND source_id = $3
        """,
        space_id,
        source_table,
        source_id,
    )


async def merge_objects(
    conn,
    space_id: UUID,
    *,
    survivor_id: UUID,
    loser_id: UUID,
    actor: str,
) -> UUID:
    """Merge loser into survivor. Events stay on original object_ids; edges repoint."""
    if survivor_id == loser_id:
        raise ValidationError("Cannot merge object with itself")

    survivor = await _fetch_object(conn, space_id, survivor_id)
    loser = await _fetch_object(conn, space_id, loser_id)
    if not survivor or not loser:
        raise NotFoundError("Space object not found")
    if loser["merged_into_id"] is not None:
        raise ValidationError("Loser object already merged")
    if survivor["merged_into_id"] is not None:
        survivor_id = await resolve_canonical_object_id(conn, space_id, survivor_id)
        survivor = await _fetch_object(conn, space_id, survivor_id)
        if not survivor:
            raise NotFoundError("Survivor object not found")

    await conn.execute(
        """
        UPDATE space_objects
        SET merged_into_id = $3, status = 'archived', updated_at = now()
        WHERE space_id = $1 AND id = $2
        """,
        space_id,
        loser_id,
        survivor_id,
    )

    await conn.execute(
        """
        DELETE FROM space_edges le
        USING space_edges se
        WHERE le.space_id = $1 AND le.from_object_id = $2
          AND se.space_id = $1 AND se.from_object_id = $3
          AND le.to_object_id = se.to_object_id
          AND le.edge_type = se.edge_type
        """,
        space_id,
        loser_id,
        survivor_id,
    )
    await conn.execute(
        """
        DELETE FROM space_edges le
        USING space_edges se
        WHERE le.space_id = $1 AND le.to_object_id = $2
          AND se.space_id = $1 AND se.to_object_id = $3
          AND le.from_object_id = se.from_object_id
          AND le.edge_type = se.edge_type
        """,
        space_id,
        loser_id,
        survivor_id,
    )

    await conn.execute(
        """
        UPDATE space_edges
        SET from_object_id = $3
        WHERE space_id = $1 AND from_object_id = $2
        """,
        space_id,
        loser_id,
        survivor_id,
    )
    await conn.execute(
        """
        UPDATE space_edges
        SET to_object_id = $3
        WHERE space_id = $1 AND to_object_id = $2
        """,
        space_id,
        loser_id,
        survivor_id,
    )
    await conn.execute(
        """
        DELETE FROM space_edges
        WHERE space_id = $1 AND from_object_id = to_object_id
        """,
        space_id,
    )

    await emit_event(
        conn,
        space_id,
        survivor_id,
        event_type="object_merged",
        actor=actor,
        importance=6,
        payload={"merged_object_id": str(loser_id), "merged_title": loser["title"]},
    )
    return survivor_id


async def add_edge(
    conn,
    space_id: UUID,
    *,
    from_object_id: UUID,
    to_object_id: UUID,
    edge_type: str,
    created_by: str = "system",
    source: str = "rule",
    confidence: float = 1.0,
) -> UUID | None:
    """Rule-based edge insert; deduped by unique constraint."""
    if edge_type not in EDGE_TYPES:
        raise ValidationError(f"Invalid edge_type: {edge_type}")

    for oid in (from_object_id, to_object_id):
        row = await _fetch_object(conn, space_id, oid)
        if not row:
            raise NotFoundError("Space object not found")

    return await conn.fetchval(
        """
        INSERT INTO space_edges (
            space_id, from_object_id, to_object_id, edge_type, created_by, source, confidence
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (space_id, from_object_id, to_object_id, edge_type) DO NOTHING
        RETURNING id
        """,
        space_id,
        from_object_id,
        to_object_id,
        edge_type,
        created_by,
        source,
        confidence,
    )


async def list_objects(
    conn,
    space_id: UUID,
    *,
    object_type: str | None = None,
    status: str | None = "active",
    q: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    clauses = ["space_id = $1", "merged_into_id IS NULL"]
    args: list[Any] = [space_id]
    n = 2
    if object_type:
        clauses.append(f"object_type = ${n}")
        args.append(object_type)
        n += 1
    if status:
        clauses.append(f"status = ${n}")
        args.append(status)
        n += 1
    if q:
        clauses.append(f"title ILIKE ${n}")
        args.append(f"%{q}%")
        n += 1
    args.append(limit)
    where = " AND ".join(clauses)
    rows = await conn.fetch(
        f"""
        SELECT * FROM space_objects
        WHERE {where}
        ORDER BY updated_at DESC
        LIMIT ${n}
        """,
        *args,
    )
    return [dict(r) for r in rows]


async def get_object_bundle(
    conn,
    space_id: UUID,
    object_id: UUID,
    *,
    event_limit: int = 20,
) -> dict[str, Any]:
    canonical_id = await resolve_canonical_object_id(conn, space_id, object_id)
    obj = await _fetch_object(conn, space_id, canonical_id)
    if not obj:
        raise NotFoundError("Space object not found")
    chain = await object_id_chain(conn, space_id, canonical_id)
    events = await conn.fetch(
        """
        SELECT * FROM object_events
        WHERE space_id = $1 AND object_id = ANY($2::uuid[])
        ORDER BY importance DESC, created_at DESC
        LIMIT $3
        """,
        space_id,
        chain,
        event_limit,
    )
    related = await get_related(conn, space_id, canonical_id)
    return {
        "object": dict(obj),
        "events": [dict(e) for e in events],
        "related": related,
    }


async def get_timeline(
    conn,
    space_id: UUID,
    object_id: UUID | None = None,
    *,
    importance_gte: int | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    if object_id is not None:
        chain = await object_id_chain(conn, space_id, object_id)
        rows = await conn.fetch(
            """
            SELECT * FROM object_events
            WHERE space_id = $1 AND object_id = ANY($2::uuid[])
            ORDER BY importance DESC, created_at DESC
            LIMIT $3
            """,
            space_id,
            chain,
            limit,
        )
        return [dict(r) for r in rows]

    if importance_gte is not None:
        rows = await conn.fetch(
            """
            SELECT * FROM object_events
            WHERE space_id = $1 AND importance >= $2
            ORDER BY importance DESC, created_at DESC
            LIMIT $3
            """,
            space_id,
            importance_gte,
            limit,
        )
    else:
        rows = await conn.fetch(
            """
            SELECT * FROM object_events
            WHERE space_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            """,
            space_id,
            limit,
        )
    return [dict(r) for r in rows]


async def get_related(conn, space_id: UUID, object_id: UUID) -> list[dict[str, Any]]:
    canonical_id = await resolve_canonical_object_id(conn, space_id, object_id)
    rows = await conn.fetch(
        """
        SELECT e.*, o.title AS peer_title, o.object_type AS peer_type
        FROM space_edges e
        JOIN space_objects o ON o.id = CASE
            WHEN e.from_object_id = $2 THEN e.to_object_id
            ELSE e.from_object_id
        END
        WHERE e.space_id = $1
          AND ($2 = e.from_object_id OR $2 = e.to_object_id)
          AND o.merged_into_id IS NULL
        ORDER BY e.created_at DESC
        """,
        space_id,
        canonical_id,
    )
    return [dict(r) for r in rows]


async def search_objects(
    conn,
    space_id: UUID,
    q: str,
    *,
    object_type: str | None = None,
    limit: int = 25,
) -> list[dict[str, Any]]:
    return await list_objects(conn, space_id, object_type=object_type, q=q, limit=limit)


EXPLICIT_CREATE_TYPES = frozenset({"project", "decision"})


async def create_object(
    conn,
    space_id: UUID,
    *,
    object_type: str,
    title: str,
    metadata: dict[str, Any] | None = None,
    owner_id: UUID | None = None,
    actor: str,
) -> UUID:
    if object_type not in EXPLICIT_CREATE_TYPES:
        raise ValidationError("Only project and decision can be created explicitly in Phase 1")
    if object_type not in OBJECT_TYPES:
        raise ValidationError(f"Invalid object_type: {object_type}")

    object_id = await conn.fetchval(
        """
        INSERT INTO space_objects (
            space_id, object_type, title, metadata, owner_id, source_kind
        ) VALUES ($1, $2, $3, $4::jsonb, $5, 'live')
        RETURNING id
        """,
        space_id,
        object_type,
        title.strip(),
        json.dumps(metadata or {}),
        owner_id,
    )
    await emit_event(
        conn,
        space_id,
        object_id,
        event_type="object_created",
        actor=actor,
        importance=6,
        payload={"title": title, "object_type": object_type},
    )
    return object_id


async def update_object(
    conn,
    space_id: UUID,
    object_id: UUID,
    *,
    title: str | None = None,
    metadata: dict[str, Any] | None = None,
    status: str | None = None,
    actor: str,
) -> dict[str, Any]:
    row = await _fetch_object(conn, space_id, object_id)
    if not row:
        raise NotFoundError("Space object not found")
    if row["merged_into_id"] is not None:
        raise ValidationError("Cannot update merged object")

    changes: dict[str, Any] = {}
    sets: list[str] = ["updated_at = now()"]
    args: list[Any] = [space_id, object_id]
    n = 3

    if title is not None and title.strip() != row["title"]:
        changes["title"] = {"from": row["title"], "to": title.strip()}
        sets.append(f"title = ${n}")
        args.append(title.strip())
        n += 1
    if metadata is not None:
        current_meta = row["metadata"] or {}
        if isinstance(current_meta, str):
            current_meta = json.loads(current_meta)
        if metadata != current_meta:
            changes["metadata"] = metadata
            sets.append(f"metadata = ${n}::jsonb")
            args.append(json.dumps(metadata))
            n += 1
    if status is not None:
        if status not in OBJECT_STATUSES:
            raise ValidationError(f"Invalid status: {status}")
        if status != row["status"]:
            changes["status"] = {"from": row["status"], "to": status}
            sets.append(f"status = ${n}")
            args.append(status)
            n += 1

    if not changes:
        return dict(row)

    updated = await conn.fetchrow(
        f"""
        UPDATE space_objects SET {", ".join(sets)}
        WHERE space_id = $1 AND id = $2
        RETURNING *
        """,
        *args,
    )
    event_type = "decision_reconsidered" if row["object_type"] == "decision" and "status" in changes else "object_updated"
    await emit_event(
        conn,
        space_id,
        object_id,
        event_type=event_type,
        actor=actor,
        importance=6,
        payload=changes,
    )
    return dict(updated)
