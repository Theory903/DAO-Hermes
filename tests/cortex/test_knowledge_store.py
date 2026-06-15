"""Dynamic knowledge storage — folders and brain entities from agent writes."""

from __future__ import annotations

import pytest

from DAO.brain.service import (
    is_brain_compiled_path,
    knowledge_slug_from_path,
    slugify_title,
)
from DAO.drive.folders import folder_under_path, parent_folder_paths


def test_parent_folder_paths():
    assert parent_folder_paths("/knowledge/acme-corp/compiled.md") == [
        "/knowledge/",
        "/knowledge/acme-corp/",
    ]
    assert parent_folder_paths("/writeback/2026/06/15/scan.md") == [
        "/writeback/",
        "/writeback/2026/",
        "/writeback/2026/06/",
        "/writeback/2026/06/15/",
    ]
    assert parent_folder_paths("/inbox.md") == []


def test_folder_under_path():
    assert folder_under_path("/", "/knowledge/")
    assert folder_under_path("/knowledge/", "/knowledge/acme/")
    assert not folder_under_path("/writeback/", "/knowledge/")


def test_knowledge_slug_from_path():
    assert knowledge_slug_from_path("/knowledge/acme-corp/compiled.md") == "acme-corp"
    assert knowledge_slug_from_path("/writeback/x.md") is None


def test_is_brain_compiled_path():
    assert is_brain_compiled_path("/knowledge/foo/compiled.md")
    assert is_brain_compiled_path("/knowledge/foo/truth.md")
    assert not is_brain_compiled_path("/knowledge/foo/notes.md")


def test_slugify_title():
    assert slugify_title("Acme Corp Pricing") == "acme-corp-pricing"


@pytest.mark.asyncio
async def test_store_knowledge_creates_folders_and_brain_entity(test_space, test_user):
    from DAO.db import rls_connection
    from DAO.drive.store import store_text_object

    uid = test_user["id"]
    path = "/knowledge/competitor-acme/compiled.md"
    content = "# Acme pricing\n\nEnterprise tier starts at $50k ARR."

    async with rls_connection(space_id=test_space.id, user_id=uid) as conn:
        oid = await store_text_object(
            conn,
            test_space.id,
            path,
            content,
            produced_by_dept="research",
            brain_title="Acme pricing",
        )
        folders = [
            r["path"]
            for r in await conn.fetch(
                "SELECT path FROM drive_folders WHERE space_id = $1 ORDER BY path",
                test_space.id,
            )
        ]
        entity = await conn.fetchrow(
            "SELECT slug, compiled_truth FROM brain_entities WHERE space_id = $1 AND slug = $2",
            test_space.id,
            "competitor-acme",
        )

    assert oid is not None
    assert "/knowledge/" in folders
    assert "/knowledge/competitor-acme/" in folders
    assert entity is not None
    assert "Acme pricing" in entity["compiled_truth"]
