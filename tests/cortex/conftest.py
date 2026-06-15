"""Shared fixtures for DAO DB integration tests."""

from __future__ import annotations

import os
import uuid

import pytest
import pytest_asyncio

pytest.importorskip("asyncpg")

from DAO.db import admin_connection, close_pool, init_pool, rls_connection
from DAO.spaces.models import SpaceCreate
from DAO.spaces import repository as spaces_repo


def _database_url() -> str | None:
    return os.environ.get("DATABASE_URL") or os.environ.get("DAO_TEST_DATABASE_URL")


@pytest.fixture(scope="session")
def database_url() -> str:
    url = _database_url()
    if not url:
        pytest.skip("DATABASE_URL not set — skip DAO DB integration tests")
    return url


@pytest_asyncio.fixture
async def db_pool(database_url: str):
    os.environ["DATABASE_URL"] = database_url
    os.environ.setdefault("JWT_SECRET", "test-secret-for-integration")
    os.environ.setdefault("DAO_API_ENABLED", "1")
    pool = await init_pool()
    yield pool
    await close_pool()


@pytest_asyncio.fixture
async def test_user(db_pool):
    email = f"test-{uuid.uuid4().hex[:8]}@DAO.test"
    async with admin_connection() as conn:
        user_id = await conn.fetchval(
            """
            INSERT INTO users (email, display_name, oauth_provider, oauth_subject)
            VALUES ($1::text::citext, $2, 'dev', $3)
            RETURNING id
            """,
            email,
            "Test User",
            email,
        )
    yield {"id": user_id, "email": email}
    async with admin_connection() as conn:
        await conn.execute("DELETE FROM users WHERE id = $1", user_id)


@pytest_asyncio.fixture
async def test_space(db_pool, test_user):
    slug = f"test-{uuid.uuid4().hex[:8]}"
    async with admin_connection() as conn:
        space = await spaces_repo.create_space(
            conn,
            user_id=test_user["id"],
            payload=SpaceCreate(name=f"Test {slug}", slug=slug),
        )
    yield space
    async with admin_connection() as conn:
        await conn.execute("DELETE FROM spaces WHERE id = $1", space.id)


@pytest_asyncio.fixture
async def second_space(db_pool, test_user):
    slug = f"test-b-{uuid.uuid4().hex[:8]}"
    async with admin_connection() as conn:
        space = await spaces_repo.create_space(
            conn,
            user_id=test_user["id"],
            payload=SpaceCreate(name=f"Test B {slug}", slug=slug),
        )
    yield space
    async with admin_connection() as conn:
        await conn.execute("DELETE FROM spaces WHERE id = $1", space.id)
