"""Shared Drive object persistence (folders + optional Brain sync)."""

from __future__ import annotations

from uuid import UUID

from DAO.brain.service import maybe_sync_brain_from_drive_write
from DAO.objects.ingest import ingest_drive_object
from DAO.drive.folders import ensure_folder_paths
from DAO.drive.storage import store_blob


async def store_text_object(
    conn,
    space_id: UUID,
    path: str,
    content: str,
    *,
    mime: str = "text/markdown",
    produced_by_dept: str | None = None,
    brain_title: str | None = None,
    brain_confidence: float = 0.65,
) -> UUID:
    """Store markdown/text at ``path``, ensure parent folders exist, sync Brain when applicable."""
    data = content.encode("utf-8")
    blob_key, ch = store_blob(space_id, path, data)
    await ensure_folder_paths(conn, space_id, path)
    oid = await conn.fetchval(
        """
        INSERT INTO drive_objects (space_id, path, blob_key, content_hash, mime, size, produced_by_dept)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
        """,
        space_id,
        path,
        blob_key,
        ch,
        mime,
        len(data),
        produced_by_dept,
    )
    await maybe_sync_brain_from_drive_write(
        conn,
        space_id,
        path=path,
        content=content,
        object_id=oid,
        title_hint=brain_title,
        confidence=brain_confidence,
    )
    await ingest_drive_object(
        conn,
        space_id,
        drive_object_id=oid,
        path=path,
        produced_by_dept=produced_by_dept,
    )
    return oid
