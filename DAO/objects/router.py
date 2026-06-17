"""Company Graph REST API."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from DAO.db import rls_connection
from DAO.deps import current_user_id, require_space_role
from DAO.exceptions import NotFoundError
from DAO.objects import service as graph
from DAO.objects.backfill import backfill_space
from DAO.objects.constants import EDGE_TYPES
from DAO.memory import search as memory_search

router = APIRouter(prefix="/spaces/{space_id}", tags=["objects"])


class MergeBody(BaseModel):
    into_object_id: UUID


class CreateObjectBody(BaseModel):
    object_type: str
    title: str
    metadata: dict = Field(default_factory=dict)


class UpdateObjectBody(BaseModel):
    title: str | None = None
    metadata: dict | None = None
    status: str | None = None


class AddEdgeBody(BaseModel):
    to_object_id: UUID
    edge_type: str = "related_to"


@router.get("/objects")
async def list_space_objects(
    space_id: UUID,
    request: Request,
    object_type: str | None = None,
    status: str | None = "active",
    q: str | None = None,
    limit: int = 50,
):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        objects = await graph.list_objects(
            conn, space_id, object_type=object_type, status=status, q=q, limit=limit
        )
    return {"objects": objects}


@router.post("/objects", status_code=201)
async def create_space_object(space_id: UUID, body: CreateObjectBody, request: Request):
    uid = current_user_id(request)
    async with rls_connection(space_id=space_id, user_id=uid) as conn:
        object_id = await graph.create_object(
            conn,
            space_id,
            object_type=body.object_type,
            title=body.title,
            metadata=body.metadata,
            owner_id=uid,
            actor=f"human:{uid}",
        )
        bundle = await graph.get_object_bundle(conn, space_id, object_id)
    return bundle


@router.get("/objects/source/{source_table}/{source_id}")
async def get_object_by_source(
    space_id: UUID,
    source_table: str,
    source_id: UUID,
    request: Request,
):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        object_id = await graph.lookup_object_by_source(conn, space_id, source_table, source_id)
        if not object_id:
            raise NotFoundError("Space object not found for source")
        bundle = await graph.get_object_bundle(conn, space_id, object_id)
    return bundle


@router.get("/objects/{object_id}")
async def get_space_object(space_id: UUID, object_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        try:
            bundle = await graph.get_object_bundle(conn, space_id, object_id)
        except NotFoundError:
            raise
    return bundle


@router.patch("/objects/{object_id}")
async def patch_space_object(
    space_id: UUID,
    object_id: UUID,
    body: UpdateObjectBody,
    request: Request,
):
    uid = current_user_id(request)
    async with rls_connection(space_id=space_id, user_id=uid) as conn:
        obj = await graph.update_object(
            conn,
            space_id,
            object_id,
            title=body.title,
            metadata=body.metadata,
            status=body.status,
            actor=f"human:{uid}",
        )
    return {"object": obj}


@router.post("/objects/{object_id}/edges", status_code=201)
async def add_object_edge(
    space_id: UUID,
    object_id: UUID,
    body: AddEdgeBody,
    request: Request,
):
    if body.edge_type not in EDGE_TYPES:
        return {"error": "invalid edge_type"}
    uid = current_user_id(request)
    async with rls_connection(space_id=space_id, user_id=uid) as conn:
        edge_id = await graph.add_edge(
            conn,
            space_id,
            from_object_id=object_id,
            to_object_id=body.to_object_id,
            edge_type=body.edge_type,
            created_by=f"human:{uid}",
            source="human",
        )
        if edge_id:
            await graph.emit_event(
                conn,
                space_id,
                object_id,
                event_type="object_linked",
                actor=f"human:{uid}",
                importance=5,
                payload={
                    "edge_id": str(edge_id),
                    "to_object_id": str(body.to_object_id),
                    "edge_type": body.edge_type,
                },
            )
    return {"edge_id": str(edge_id) if edge_id else None}


@router.post("/objects/{object_id}/merge")
async def merge_space_objects(
    space_id: UUID,
    object_id: UUID,
    body: MergeBody,
    request: Request,
):
    require_space_role(request, "owner", "admin")
    uid = current_user_id(request)
    async with rls_connection(space_id=space_id, user_id=uid) as conn:
        survivor_id = await graph.merge_objects(
            conn,
            space_id,
            survivor_id=body.into_object_id,
            loser_id=object_id,
            actor=f"human:{uid}",
        )
    return {"survivor_id": str(survivor_id)}


@router.get("/objects/{object_id}/timeline")
async def object_timeline(
    space_id: UUID,
    object_id: UUID,
    request: Request,
    limit: int = 50,
):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        events = await graph.get_timeline(conn, space_id, object_id, limit=limit)
    return {"events": events}


@router.get("/objects/{object_id}/related")
async def object_related(space_id: UUID, object_id: UUID, request: Request):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        try:
            related = await graph.get_related(conn, space_id, object_id)
        except NotFoundError:
            raise
    return {"related": related}


@router.get("/timeline")
async def space_timeline(
    space_id: UUID,
    request: Request,
    importance_gte: int | None = None,
    limit: int = 50,
):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        events = await graph.get_timeline(
            conn,
            space_id,
            None,
            importance_gte=importance_gte,
            limit=limit,
        )
    return {"events": events}


@router.get("/search/objects")
async def search_space_objects(
    space_id: UUID,
    request: Request,
    q: str = "",
    object_type: str | None = None,
    limit: int = 25,
):
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        objects = await memory_search.search_memory(
            conn, space_id, q, object_type=object_type, limit=limit
        )
    return {"objects": objects}


@router.post("/graph/backfill")
async def run_graph_backfill(space_id: UUID, request: Request):
    require_space_role(request, "owner", "admin")
    async with rls_connection(space_id=space_id, user_id=current_user_id(request)) as conn:
        stats = await backfill_space(conn, space_id)
    return {
        "ok": True,
        "ingested": stats.total_ingested(),
        "skipped": stats.skipped,
        "by_source": {
            "drive": stats.drive,
            "brain_entities": stats.brain_entities,
            "hitl": stats.hitl,
            "interdept": stats.interdept,
            "briefings": stats.briefings,
        },
    }
