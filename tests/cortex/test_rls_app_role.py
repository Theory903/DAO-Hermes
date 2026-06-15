"""DAO_app role is subject to FORCE RLS (non-superuser isolation)."""

from __future__ import annotations

import os
import uuid

import pytest
import pytest_asyncio

from DAO.drive.storage import store_blob

pytest.importorskip("asyncpg")

import asyncpg


def _app_database_url(admin_url: str) -> str | None:
    explicit = os.environ.get("DATABASE_APP_URL")
    if explicit:
        return explicit
    if "DAO_app" in admin_url:
        return admin_url
    if admin_url.startswith("postgresql://DAO:"):
        return admin_url.replace("postgresql://DAO:", "postgresql://DAO_app:DAO_app_dev@", 1)
    return None


@pytest_asyncio.fixture
async def app_db_conn(database_url: str):
    app_url = _app_database_url(database_url)
    if not app_url:
        pytest.skip("Could not derive DAO_app DATABASE URL")
    try:
        conn = await asyncpg.connect(app_url)
    except Exception as exc:
        pytest.skip(f"DAO_app role unavailable (run migration 005): {exc}")
    try:
        role = await conn.fetchval("SELECT rolsuper FROM pg_roles WHERE rolname = current_user")
        if role:
            pytest.skip("DAO_app connection resolved to superuser — migration 005 not applied")
        yield conn
    finally:
        await conn.close()


@pytest.mark.asyncio
async def test_DAO_app_cannot_read_other_space_drive(
    app_db_conn,
    test_space,
    second_space,
    test_user,
):
    uid = test_user["id"]
    blob_a, _ = store_blob(test_space.id, "/rls-app/a.md", b"secret-a")
    blob_b, _ = store_blob(second_space.id, "/rls-app/b.md", b"secret-b")

    # Seed rows as superuser via a one-off admin connection pattern — use test fixtures' admin
    from DAO.db import admin_connection, init_pool, close_pool

    os.environ["DATABASE_URL"] = os.environ.get("DATABASE_URL") or os.environ.get("DAO_TEST_DATABASE_URL", "")
    await init_pool()
    try:
        async with admin_connection() as admin:
            await admin.execute(
                """
                INSERT INTO drive_objects (space_id, path, blob_key, content_hash, mime, size)
                VALUES ($1, '/rls-app/a.md', $2, 'ha', 'text/plain', 8)
                """,
                test_space.id,
                blob_a,
            )
            await admin.execute(
                """
                INSERT INTO drive_objects (space_id, path, blob_key, content_hash, mime, size)
                VALUES ($1, '/rls-app/b.md', $2, 'hb', 'text/plain', 8)
                """,
                second_space.id,
                blob_b,
            )
    finally:
        await close_pool()

    async with app_db_conn.transaction():
        await app_db_conn.execute(
            "SELECT set_config('app.current_space_id', $1, true)",
            str(test_space.id),
        )
        await app_db_conn.execute(
            "SELECT set_config('app.current_user_id', $1, true)",
            str(uid),
        )
        paths = [
            r["path"]
            for r in await app_db_conn.fetch(
                "SELECT path FROM drive_objects WHERE path LIKE '/rls-app/%'"
            )
        ]

    assert "/rls-app/a.md" in paths
    assert "/rls-app/b.md" not in paths


@pytest.mark.asyncio
async def test_DAO_app_without_space_context_sees_no_tenant_rows(app_db_conn, test_space, test_user):
    from DAO.db import admin_connection, init_pool, close_pool

    os.environ["DATABASE_URL"] = os.environ.get("DATABASE_URL") or os.environ.get("DAO_TEST_DATABASE_URL", "")
    await init_pool()
    slug = f"rls-nospace-{uuid.uuid4().hex[:6]}"
    try:
        async with admin_connection() as admin:
            await admin.execute(
                """
                INSERT INTO drive_objects (space_id, path, blob_key, content_hash, mime, size)
                VALUES ($1, $2, 'blob', 'h', 'text/plain', 1)
                """,
                test_space.id,
                f"/{slug}/x.md",
            )
    finally:
        await close_pool()

    async with app_db_conn.transaction():
        await app_db_conn.execute("SELECT set_config('app.current_space_id', '', true)")
        count = await app_db_conn.fetchval(
            "SELECT count(*) FROM drive_objects WHERE path = $1",
            f"/{slug}/x.md",
        )

    assert count == 0
