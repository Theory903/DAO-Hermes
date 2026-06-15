"""Two-space RLS isolation — required before merge per AGENTS.md."""

from __future__ import annotations

import pytest

from DAO.db import rls_connection
from DAO.drive.storage import store_blob
from DAO.research_memory.service import ResearchMemoryService


@pytest.mark.asyncio
async def test_two_spaces_disjoint_drive_objects(test_space, second_space, test_user):
    uid = test_user["id"]
    blob_a, _ = store_blob(test_space.id, "/isolation/a.md", b"space-a-secret")
    blob_b, _ = store_blob(second_space.id, "/isolation/b.md", b"space-b-secret")

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        await conn.execute(
            """
            INSERT INTO drive_objects (space_id, path, blob_key, content_hash, mime, size)
            VALUES ($1, '/isolation/a.md', $2, 'hash-a', 'text/plain', 16)
            """,
            test_space.id,
            blob_a,
        )
        count_a = await conn.fetchval(
            """
            SELECT count(*) FROM drive_objects
            WHERE space_id = $1 AND path LIKE '/isolation/%'
            """,
            test_space.id,
        )

    async with rls_connection(space_id=second_space.id, user_id=uid) as conn:
        await conn.execute(
            """
            INSERT INTO drive_objects (space_id, path, blob_key, content_hash, mime, size)
            VALUES ($1, '/isolation/b.md', $2, 'hash-b', 'text/plain', 16)
            """,
            second_space.id,
            blob_b,
        )
        count_b = await conn.fetchval(
            """
            SELECT count(*) FROM drive_objects
            WHERE space_id = $1 AND path LIKE '/isolation/%'
            """,
            second_space.id,
        )

    assert count_a == 1
    assert count_b == 1

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        paths = [
            r["path"]
            for r in await conn.fetch(
                """
                SELECT path FROM drive_objects
                WHERE space_id = $1 AND path LIKE '/isolation/%'
                """,
                test_space.id,
            )
        ]
    assert paths == ["/isolation/a.md"]
    assert "/isolation/b.md" not in paths


@pytest.mark.asyncio
async def test_two_spaces_disjoint_research_sessions(test_space, second_space, test_user):
    uid = test_user["id"]
    intent = "analyze competitor Acme pricing strategy"

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        svc = ResearchMemoryService(conn, test_space.id)
        sid = await svc.start_session(intent, department="research")
        await svc.append_trace(sid, step_type="tool_call", output_summary="found pricing page")
        await svc.finalize_session(sid)

    async with rls_connection(space_id=second_space.id, user_id=uid) as conn:
        svc = ResearchMemoryService(conn, second_space.id)
        replay = await svc.resolve(intent, department="research")
        assert replay is None

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        svc = ResearchMemoryService(conn, test_space.id)
        replay = await svc.resolve(intent, department="research")
        assert replay is not None
        assert replay["reuse"] is True
