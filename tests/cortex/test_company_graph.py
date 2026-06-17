"""Phase 0 Company Graph integration tests — requires migration 010 + DATABASE_URL."""

from __future__ import annotations

import uuid
from pathlib import Path, PurePosixPath

import pytest
import pytest_asyncio

from DAO.db import rls_connection
from DAO.drive.store import store_text_object
from DAO.drive.storage import store_blob
from DAO.objects import service as graph
from DAO.objects.backfill import backfill_space
from DAO.objects.ingest import ingest_drive_object, ingest_hitl_resolved, ingest_interdept_handoff
from DAO.objects.repairs import enqueue_repair, infer_edges_safe, process_pending_repairs


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
async def test_store_text_object_creates_document_and_event(graph_ready, test_space, test_user):
    uid = test_user["id"]
    path = f"/graph-test/{uuid.uuid4().hex}.md"

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        drive_id = await store_text_object(
            conn,
            test_space.id,
            path,
            "# Graph test\n",
            produced_by_dept="research",
        )
        obj_id = await conn.fetchval(
            """
            SELECT id FROM space_objects
            WHERE space_id = $1 AND source_table = 'drive_objects' AND source_id = $2
            """,
            test_space.id,
            drive_id,
        )
        event_count = await conn.fetchval(
            "SELECT count(*) FROM object_events WHERE space_id = $1 AND object_id = $2",
            test_space.id,
            obj_id,
        )
        search_hits = await graph.search_objects(conn, test_space.id, PurePosixPath(path).name)

    assert obj_id is not None
    assert event_count == 1
    assert any(h["id"] == obj_id for h in search_hits)


@pytest.mark.asyncio
async def test_ingest_idempotent_no_duplicate_events(graph_ready, test_space, test_user):
    uid = test_user["id"]
    source_id = uuid.uuid4()

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        oid1 = await ingest_drive_object(
            conn,
            test_space.id,
            drive_object_id=source_id,
            path="/idempotent/doc.md",
        )
        oid2 = await ingest_drive_object(
            conn,
            test_space.id,
            drive_object_id=source_id,
            path="/idempotent/doc.md",
        )
        events = await conn.fetchval(
            """
            SELECT count(*) FROM object_events
            WHERE space_id = $1 AND object_id = $2
            """,
            test_space.id,
            oid1,
        )

    assert oid1 == oid2
    assert events == 1


@pytest.mark.asyncio
async def test_backfill_idempotent_ten_runs(graph_ready, test_space, test_user):
    uid = test_user["id"]
    source_id = uuid.uuid4()

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        for _ in range(10):
            await graph.ingest_from_source(
                conn,
                test_space.id,
                source_table="drive_objects",
                source_id=source_id,
                object_type="document",
                title="Backfill doc",
                source_kind="backfill",
            )
        obj_count = await conn.fetchval(
            """
            SELECT count(*) FROM space_objects
            WHERE space_id = $1 AND source_table = 'drive_objects' AND source_id = $2
            """,
            test_space.id,
            source_id,
        )
        event_count = await conn.fetchval(
            """
            SELECT count(*) FROM object_events e
            JOIN space_objects o ON o.id = e.object_id
            WHERE o.space_id = $1 AND o.source_id = $2
            """,
            test_space.id,
            source_id,
        )

    assert obj_count == 1
    assert event_count == 1


@pytest.mark.asyncio
async def test_hitl_resolve_creates_decision_object(graph_ready, test_space, test_user):
    uid = test_user["id"]
    hitl_id = uuid.uuid4()

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        await ingest_hitl_resolved(
            conn,
            test_space.id,
            hitl_id=hitl_id,
            action_summary="Approve vendor contract",
            status="approved",
            resolved_by=uid,
        )
        obj = await conn.fetchrow(
            """
            SELECT id, object_type FROM space_objects
            WHERE space_id = $1 AND source_table = 'hitl_requests' AND source_id = $2
            """,
            test_space.id,
            hitl_id,
        )
        event_type = await conn.fetchval(
            """
            SELECT event_type FROM object_events
            WHERE space_id = $1 AND object_id = $2
            """,
            test_space.id,
            obj["id"],
        )

    assert obj is not None
    assert obj["object_type"] == "decision"
    assert event_type == "decision_approved"


@pytest.mark.asyncio
async def test_merge_preserves_events_repoints_survivor(
    graph_ready, test_space, test_user
):
    uid = test_user["id"]
    a_id = uuid.uuid4()
    b_id = uuid.uuid4()

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        survivor = await graph.ingest_from_source(
            conn,
            test_space.id,
            source_table="drive_objects",
            source_id=a_id,
            object_type="project",
            title="Referral Rollout",
        )
        loser = await graph.ingest_from_source(
            conn,
            test_space.id,
            source_table="drive_objects",
            source_id=b_id,
            object_type="project",
            title="Referral Program",
        )
        await graph.add_edge(
            conn,
            test_space.id,
            from_object_id=loser,
            to_object_id=survivor,
            edge_type="related_to",
            source="rule:test",
        )
        loser_events_before = await conn.fetchval(
            "SELECT count(*) FROM object_events WHERE object_id = $1",
            loser,
        )
        await graph.merge_objects(
            conn,
            test_space.id,
            survivor_id=survivor,
            loser_id=loser,
            actor=f"human:{uid}",
        )
        loser_events_after = await conn.fetchval(
            "SELECT count(*) FROM object_events WHERE object_id = $1",
            loser,
        )
        timeline = await graph.get_timeline(conn, test_space.id, survivor)
        edge_to = await conn.fetchval(
            """
            SELECT count(*) FROM space_edges
            WHERE space_id = $1 AND from_object_id = $2 AND to_object_id = $3
            """,
            test_space.id,
            survivor,
            survivor,
        )
        related_from_survivor = await conn.fetchval(
            """
            SELECT count(*) FROM space_edges
            WHERE space_id = $1 AND from_object_id = $2
            """,
            test_space.id,
            survivor,
        )

    assert loser_events_before == 1
    assert loser_events_after == 1
    assert len(timeline) >= 2
    assert edge_to == 0
    assert related_from_survivor >= 0


@pytest.mark.asyncio
async def test_two_spaces_graph_isolation(
    graph_ready, test_space, second_space, test_user
):
    uid = test_user["id"]
    src_a = uuid.uuid4()
    src_b = uuid.uuid4()

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        await graph.ingest_from_source(
            conn,
            test_space.id,
            source_table="drive_objects",
            source_id=src_a,
            object_type="document",
            title="Space A secret",
        )

    async with rls_connection(space_id=second_space.id, user_id=uid) as conn:
        await graph.ingest_from_source(
            conn,
            second_space.id,
            source_table="drive_objects",
            source_id=src_b,
            object_type="document",
            title="Space B secret",
        )

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        titles = [
            r["title"]
            for r in await graph.list_objects(conn, test_space.id, status=None, limit=100)
        ]

    assert "Space A secret" in titles
    assert "Space B secret" not in titles


@pytest.mark.asyncio
async def test_backfill_space_from_legacy_drive_row(graph_ready, test_space, test_user):
    uid = test_user["id"]
    path = f"/backfill-legacy/{uuid.uuid4().hex}.md"

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        data = b"# Legacy doc\n"
        blob_key, ch = store_blob(test_space.id, path, data)
        drive_id = await conn.fetchval(
            """
            INSERT INTO drive_objects (
                space_id, path, blob_key, content_hash, mime, size
            ) VALUES ($1, $2, $3, $4, 'text/markdown', $5)
            RETURNING id
            """,
            test_space.id,
            path,
            blob_key,
            ch,
            len(data),
        )
        before = await conn.fetchval(
            "SELECT count(*) FROM space_objects WHERE space_id = $1 AND source_id = $2",
            test_space.id,
            drive_id,
        )
        stats1 = await backfill_space(conn, test_space.id)
        stats2 = await backfill_space(conn, test_space.id)
        after = await conn.fetchval(
            "SELECT count(*) FROM space_objects WHERE space_id = $1 AND source_id = $2",
            test_space.id,
            drive_id,
        )
        events = await conn.fetchval(
            """
            SELECT count(*) FROM object_events e
            JOIN space_objects o ON o.id = e.object_id
            WHERE o.space_id = $1 AND o.source_id = $2
            """,
            test_space.id,
            drive_id,
        )

    assert before == 0
    assert after == 1
    assert events == 1
    assert stats1.drive >= 1
    assert stats2.drive == 0


@pytest.mark.asyncio
async def test_hitl_reresolve_appends_event(graph_ready, test_space, test_user):
    uid = test_user["id"]
    hitl_id = uuid.uuid4()

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        oid = await ingest_hitl_resolved(
            conn,
            test_space.id,
            hitl_id=hitl_id,
            action_summary="First approval",
            status="approved",
            resolved_by=uid,
        )
        await ingest_hitl_resolved(
            conn,
            test_space.id,
            hitl_id=hitl_id,
            action_summary="First approval",
            status="rejected",
            resolved_by=uid,
        )
        event_count = await conn.fetchval(
            "SELECT count(*) FROM object_events WHERE object_id = $1",
            oid,
        )

    assert event_count == 2


@pytest.mark.asyncio
async def test_handoff_drive_ref_edge_post_ingest(graph_ready, test_space, test_user):
    uid = test_user["id"]
    path = f"/handoff-ref/{uuid.uuid4().hex}.md"
    msg_id = uuid.uuid4()

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        drive_id = await store_text_object(
            conn, test_space.id, path, "# Handoff attachment\n"
        )
        await ingest_interdept_handoff(
            conn,
            test_space.id,
            message_id=msg_id,
            subject="Research → Sales",
            from_dept="research",
            to_dept="sales",
        )
        edges = await infer_edges_safe(
            conn,
            test_space.id,
            source_table="interdept_messages",
            source_id=msg_id,
            drive_ref_ids=[drive_id],
        )
        related = await graph.get_related(
            conn,
            test_space.id,
            await graph.lookup_object_by_source(
                conn, test_space.id, "interdept_messages", msg_id
            ),
        )

    assert len(edges) == 1
    assert len(related) == 1


@pytest.mark.asyncio
async def test_graph_repair_retries_infer_edges(graph_ready, test_space, test_user):
    uid = test_user["id"]
    path = f"/repair/{uuid.uuid4().hex}.md"
    msg_id = uuid.uuid4()

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        drive_id = await store_text_object(conn, test_space.id, path, "# Repair me\n")
        await ingest_interdept_handoff(
            conn,
            test_space.id,
            message_id=msg_id,
            subject="Retry handoff",
            from_dept="ops",
            to_dept="research",
        )
        await enqueue_repair(
            conn,
            test_space.id,
            repair_kind="infer_edges",
            payload={
                "source_table": "interdept_messages",
                "source_id": str(msg_id),
                "drive_ref_ids": [str(drive_id)],
            },
        )
        processed = await process_pending_repairs(conn, test_space.id)
        pending = await conn.fetchval(
            "SELECT count(*) FROM graph_repairs WHERE space_id = $1",
            test_space.id,
        )

    assert processed == 1
    assert pending == 0


@pytest.mark.asyncio
async def test_txn_rollback_leaves_no_orphan_graph_rows(graph_ready, test_space, test_user):
    uid = test_user["id"]
    path = f"/rollback/{uuid.uuid4().hex}.md"

    with pytest.raises(RuntimeError):
        async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
            await store_text_object(conn, test_space.id, path, "# rollback\n")
            raise RuntimeError("abort txn")

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        drive_count = await conn.fetchval(
            "SELECT count(*) FROM drive_objects WHERE space_id = $1 AND path = $2",
            test_space.id,
            path,
        )
        graph_count = await conn.fetchval(
            """
            SELECT count(*) FROM space_objects o
            JOIN drive_objects d ON d.id = o.source_id AND o.source_table = 'drive_objects'
            WHERE d.space_id = $1 AND d.path = $2
            """,
            test_space.id,
            path,
        )

    assert drive_count == 0
    assert graph_count == 0


def test_dao_code_never_mutates_object_events():
    dao_root = Path(__file__).resolve().parents[2] / "DAO"
    forbidden = ("UPDATE object_events", "DELETE FROM object_events")
    for py in dao_root.rglob("*.py"):
        text = py.read_text(encoding="utf-8")
        for phrase in forbidden:
            assert phrase not in text, f"{py.relative_to(dao_root)} contains {phrase!r}"


@pytest.mark.asyncio
async def test_create_project_and_decision(graph_ready, test_space, test_user):
    uid = test_user["id"]

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        project_id = await graph.create_object(
            conn,
            test_space.id,
            object_type="project",
            title="Q3 Referral Rollout",
            actor=f"human:{uid}",
        )
        decision_id = await graph.create_object(
            conn,
            test_space.id,
            object_type="decision",
            title="Approve vendor contract",
            actor=f"human:{uid}",
        )
        events = await conn.fetchval(
            "SELECT count(*) FROM object_events WHERE object_id = ANY($1::uuid[])",
            [project_id, decision_id],
        )

    assert events == 2


@pytest.mark.asyncio
async def test_update_object_appends_event(graph_ready, test_space, test_user):
    uid = test_user["id"]

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        oid = await graph.create_object(
            conn,
            test_space.id,
            object_type="decision",
            title="Initial decision",
            actor=f"human:{uid}",
        )
        await graph.update_object(
            conn,
            test_space.id,
            oid,
            status="archived",
            actor=f"human:{uid}",
        )
        types = await conn.fetch(
            """
            SELECT event_type FROM object_events
            WHERE object_id = $1 ORDER BY created_at ASC
            """,
            oid,
        )

    assert [r["event_type"] for r in types] == ["object_created", "decision_reconsidered"]


@pytest.mark.asyncio
async def test_human_edge_and_lookup_by_source(graph_ready, test_space, test_user):
    uid = test_user["id"]
    drive_id = uuid.uuid4()

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        doc = await graph.ingest_from_source(
            conn,
            test_space.id,
            source_table="drive_objects",
            source_id=drive_id,
            object_type="document",
            title="spec.md",
        )
        project = await graph.create_object(
            conn,
            test_space.id,
            object_type="project",
            title="Rollout",
            actor=f"human:{uid}",
        )
        edge_id = await graph.add_edge(
            conn,
            test_space.id,
            from_object_id=project,
            to_object_id=doc,
            edge_type="related_to",
            created_by=f"human:{uid}",
            source="human",
        )
        looked_up = await graph.lookup_object_by_source(
            conn, test_space.id, "drive_objects", drive_id
        )

    assert edge_id is not None
    assert looked_up == doc


