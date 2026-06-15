"""Space Drive REST API."""

from __future__ import annotations

import json
from uuid import UUID

from fastapi import APIRouter, File, Request, UploadFile
from pydantic import BaseModel, Field

from DAO.comms import events as event_bus
from DAO.db import rls_connection
from DAO.deps import current_space_id, current_user_id
from DAO.drive.folders import ensure_folder_paths, folder_under_path, parent_folder_paths
from DAO.drive.storage import content_hash, read_blob, store_blob
from DAO.drive.store import store_text_object
from DAO.exceptions import NotFoundError
from DAO.research_memory.service import ResearchMemoryService

router = APIRouter(prefix="/spaces/{space_id}/drive", tags=["drive"])


class PreflightRequest(BaseModel):
    intent: str
    department: str
    threshold: float = 0.85


class PreflightHit(BaseModel):
    id: UUID
    path: str
    score: float


class PreflightResponse(BaseModel):
    reuse_recommended: bool
    hits: list[PreflightHit]


@router.get("/tree")
async def drive_tree(space_id: UUID, request: Request, path: str = "/"):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        folders = await conn.fetch(
            "SELECT path FROM drive_folders WHERE space_id = $1 AND path LIKE $2 ORDER BY path",
            space_id,
            path.rstrip("/") + "%",
        )
        objects = await conn.fetch(
            """
            SELECT id, path, mime, size, produced_by_dept, content_hash, created_at
            FROM drive_objects WHERE space_id = $1 AND path LIKE $2 ORDER BY path
            """,
            space_id,
            path.rstrip("/") + "%",
        )
    folder_set = {r["path"] for r in folders}
    for obj in objects:
        for folder in parent_folder_paths(obj["path"]):
            if folder_under_path(path, folder):
                folder_set.add(folder)
    return {
        "path": path,
        "folders": sorted(folder_set),
        "objects": [dict(r) for r in objects],
    }


@router.post("/upload")
async def drive_upload(space_id: UUID, request: Request, file: UploadFile = File(...), path: str = "/inbox/"):
    data = await file.read()
    ch = content_hash(data)
    logical = f"{path.rstrip('/')}/{file.filename}"
    blob_key, ch = store_blob(space_id, logical, data)

    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        dup = await conn.fetchval(
            "SELECT id FROM drive_objects WHERE space_id = $1 AND content_hash = $2",
            space_id,
            ch,
        )
        if dup:
            return {"dedup": True, "existing_id": str(dup)}

        await ensure_folder_paths(conn, space_id, logical)
        oid = await conn.fetchval(
            """
            INSERT INTO drive_objects (space_id, path, blob_key, content_hash, mime, size)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
            """,
            space_id,
            logical,
            blob_key,
            ch,
            file.content_type or "application/octet-stream",
            len(data),
        )

    await event_bus.publish(space_id, "drive_writeback", {"object_id": str(oid), "path": logical})
    return {"id": str(oid), "path": logical, "content_hash": ch}


@router.get("/objects/{object_id}")
async def get_object(space_id: UUID, object_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        row = await conn.fetchrow(
            "SELECT * FROM drive_objects WHERE space_id = $1 AND id = $2",
            space_id,
            object_id,
        )
    if not row:
        raise NotFoundError("Drive object not found")
    try:
        body = read_blob(space_id, row["blob_key"]).decode("utf-8", errors="replace")
    except FileNotFoundError:
        body = None
    return {**dict(row), "content": body}


@router.delete("/objects/{object_id}")
async def delete_object(space_id: UUID, object_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        row = await conn.fetchrow(
            "SELECT blob_key FROM drive_objects WHERE space_id = $1 AND id = $2",
            space_id,
            object_id,
        )
        if not row:
            raise NotFoundError("Drive object not found")
        await conn.execute(
            "DELETE FROM drive_objects WHERE space_id = $1 AND id = $2",
            space_id,
            object_id,
        )
    try:
        from DAO.drive.storage import delete_blob

        delete_blob(space_id, row["blob_key"])
    except FileNotFoundError:
        pass
    await event_bus.publish(space_id, "drive_deleted", {"object_id": str(object_id)})
    return {"ok": True}


@router.get("/search")
async def search_drive(space_id: UUID, request: Request, q: str = "", dept: str | None = None):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        if dept:
            rows = await conn.fetch(
                """
                SELECT id, path, produced_by_dept, content_hash, created_at
                FROM drive_objects
                WHERE space_id = $1 AND produced_by_dept = $2
                  AND path ILIKE $3
                ORDER BY created_at DESC LIMIT 50
                """,
                space_id,
                dept,
                f"%{q}%",
            )
        else:
            rows = await conn.fetch(
                """
                SELECT id, path, produced_by_dept, content_hash, created_at
                FROM drive_objects
                WHERE space_id = $1 AND path ILIKE $2
                ORDER BY created_at DESC LIMIT 50
                """,
                space_id,
                f"%{q}%",
            )
    return {"results": [dict(r) for r in rows]}


@router.post("/preflight", response_model=PreflightResponse)
async def preflight(space_id: UUID, body: PreflightRequest, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        rm = ResearchMemoryService(conn, space_id)
        replay = await rm.resolve(body.intent, department=body.department)
        if replay and replay.get("score", 0) >= body.threshold:
            drive_ref = replay.get("drive_ref")
            hits = []
            if drive_ref:
                row = await conn.fetchrow(
                    "SELECT id, path FROM drive_objects WHERE space_id = $1 AND id = $2",
                    space_id,
                    UUID(drive_ref),
                )
                if row:
                    hits = [PreflightHit(id=row["id"], path=row["path"], score=replay["score"])]
            if not hits:
                hits = [
                    PreflightHit(
                        id=UUID(replay["session_id"]),
                        path=f"/research-memory/{replay['session_id']}",
                        score=replay["score"],
                    )
                ]
            await event_bus.publish(
                space_id,
                "research_memory_reused",
                {"session_id": replay["session_id"], "intent": body.intent},
            )
            return PreflightResponse(reuse_recommended=True, hits=hits)

        rows = await conn.fetch(
            """
            SELECT id, path FROM drive_objects
            WHERE space_id = $1 AND (produced_by_dept = $2 OR $2 = '')
            ORDER BY created_at DESC LIMIT 5
            """,
            space_id,
            body.department,
        )
    hits = [PreflightHit(id=r["id"], path=r["path"], score=0.9 - i * 0.05) for i, r in enumerate(rows)]
    reuse = bool(hits) and hits[0].score >= body.threshold
    if reuse:
        await event_bus.publish(space_id, "drive_reused", {"path": hits[0].path})
    return PreflightResponse(reuse_recommended=reuse, hits=hits)


@router.post("/writeback")
async def writeback(
    space_id: UUID,
    request: Request,
    path: str,
    content: str,
    produced_by_dept: str = "ops",
):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        oid = await store_text_object(
            conn,
            space_id,
            path,
            content,
            produced_by_dept=produced_by_dept,
        )
    await event_bus.publish(space_id, "drive_writeback", {"object_id": str(oid), "path": path})
    return {"id": str(oid)}
