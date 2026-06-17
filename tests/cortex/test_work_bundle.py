"""Phase 2 — work bundle + memory search + home graph wiring."""

from __future__ import annotations

import uuid
from pathlib import PurePosixPath

import pytest
import pytest_asyncio

from DAO.db import rls_connection
from DAO.drive.store import store_text_object
from DAO.jarvis import home as home_svc
from DAO.memory import search as memory_search
from DAO.objects import service as graph
from DAO.objects.ingest import ingest_drive_object
from DAO.work import bundle as work_svc


async def _graph_tables_exist(conn) -> bool:
    return bool(
        await conn.fetchval(
            """
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'space_objects'
            )
            """
        )
    )


@pytest_asyncio.fixture
async def graph_ready(db_pool, test_space, test_user):
    async with rls_connection(space_id=test_space.id, user_id=test_user["id"]) as conn:
        if not await _graph_tables_exist(conn):
            pytest.skip("Migration 010 not applied — run infra/migrations/010_company_graph.sql")
    yield


@pytest.mark.asyncio
async def test_memory_search_title_and_drive_path(graph_ready, test_space, test_user):
    uid = test_user["id"]
    path = f"/memory-search/{uuid.uuid4().hex}.md"

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        await store_text_object(
            conn,
            test_space.id,
            path,
            "# Unique memory token xyz\n",
            produced_by_dept="research",
        )
        filename = PurePosixPath(path).name
        path_hits = await memory_search.search_memory(conn, test_space.id, filename)

    assert any(h.get("drive_path") == path for h in path_hits)


@pytest.mark.asyncio
async def test_work_bundle_operations_from_events(graph_ready, test_space, test_user):
    uid = test_user["id"]

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        project_id = await graph.create_object(
            conn,
            test_space.id,
            object_type="project",
            title="Launch beta",
            metadata={"goal": "Ship v1"},
            owner_id=uid,
            actor=f"human:{uid}",
        )
        bundle = await work_svc.build_work_bundle(conn, test_space.id)

    assert "focus" in bundle
    assert "operations" in bundle
    assert "researching" in bundle["operations"]["lanes"]
    assert any(
        item["object_id"] == str(project_id)
        for lane in bundle["operations"]["lanes"].values()
        for item in lane
    )


@pytest.mark.asyncio
async def test_home_changed_feed_prefers_graph(graph_ready, test_space, test_user):
    uid = test_user["id"]

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        await graph.create_object(
            conn,
            test_space.id,
            object_type="decision",
            title="Pricing gate",
            metadata={},
            owner_id=uid,
            actor=f"human:{uid}",
        )
        from DAO.jarvis.briefing import fetch_briefing_context

        ctx = await fetch_briefing_context(conn, test_space.id)
        changed = await home_svc.build_changed_feed_merged(conn, test_space.id, ctx, limit=5)

    assert len(changed) >= 1
    assert any(c.get("object_id") for c in changed)
    assert changed[0].get("importance", 0) >= 6 or changed[0].get("event_type")


@pytest.mark.asyncio
async def test_work_bundle_isolated_between_spaces(
    graph_ready, test_space, second_space, test_user
):
    uid = test_user["id"]

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        await ingest_drive_object(
            conn,
            test_space.id,
            drive_object_id=uuid.uuid4(),
            path="/isolated/a.md",
        )
        bundle_a = await work_svc.build_work_bundle(conn, test_space.id)

    async with rls_connection(space_id=second_space.id, user_id=uid) as conn:
        bundle_b = await work_svc.build_work_bundle(conn, second_space.id)

    titles_a = {a["object_title"] for a in bundle_a["activity"]}
    titles_b = {a["object_title"] for a in bundle_b["activity"]}
    assert "a.md" in titles_a
    assert "a.md" not in titles_b
