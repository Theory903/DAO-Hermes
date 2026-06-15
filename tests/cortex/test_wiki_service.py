"""Tests for Drive-backed company wiki."""

from __future__ import annotations

from DAO.wiki import service as wiki_svc


def test_wiki_path_normalizes():
    assert wiki_svc.wiki_path("entities/acme") == "/wiki/entities/acme.md"
    assert wiki_svc.wiki_path("/index.md") == "/wiki/index.md"


def test_page_key_from_path():
    assert wiki_svc.page_key_from_path("/wiki/entities/acme-corp.md") == "entities/acme-corp"


def test_section_for_path():
    assert wiki_svc.section_for_path("/wiki/SCHEMA.md") == "_meta"
    assert wiki_svc.section_for_path("/wiki/entities/foo.md") == "entities"
    assert wiki_svc.section_for_path("/wiki/notes.md") == "root"


def test_title_from_content_heading():
    content = "---\ntitle: Ignored\n---\n\n# Real Title\n\nBody"
    assert wiki_svc.title_from_content(content, "/wiki/entities/x.md") == "Real Title"


def test_summary_from_body():
    body = "# Title\n\nFirst paragraph with enough text for summary."
    assert wiki_svc.summary_from_body(body).startswith("First paragraph")


def test_wiki_seed_templates_include_domain():
    assert "{domain}" in wiki_svc._SCHEMA_TEMPLATE
    assert "Wiki Index" in wiki_svc._INDEX_TEMPLATE
    assert "Wiki initialized" in wiki_svc._LOG_TEMPLATE
