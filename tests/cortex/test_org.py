"""Org catalog and service unit tests."""

from __future__ import annotations

import pytest

pytest.importorskip("asyncpg")

from DAO.org.catalog import (
    DEFAULT_DEPARTMENTS,
    normalize_department_keys,
    suggest_template_id,
    template_payload,
)
from DAO.org import service as org_service


def test_normalize_department_keys_dedupes_and_drops_executive():
    keys = normalize_department_keys(["research", "Research", "executive", "bogus", "ops"])
    assert keys == ["research", "ops"]


def test_suggest_template_growth_keywords():
    tid, _reason = suggest_template_id(mission="Grow pipeline and revenue", space_name="Acme")
    assert tid == "growth"


def test_suggest_template_product_studio():
    tid, _reason = suggest_template_id(mission="Product design and UX research", space_name="Studio")
    assert tid == "product-studio"


def test_template_payload_includes_department_meta():
    tpl = template_payload("lean-three")
    assert tpl["id"] == "lean-three"
    assert len(tpl["departments"]) == 3
    assert all("label" in d and "color" in d for d in tpl["departments"])


def test_chart_edges_from_parent_agent_id():
    agents = [
        {"id": "lead", "parent_agent_id": None},
        {"id": "worker", "parent_agent_id": "lead"},
    ]
    edges = org_service.chart_edges_from_agents(agents)
    assert edges == [{"from": "lead", "to": "worker", "type": "supervises"}]


@pytest.mark.asyncio
async def test_apply_template_merges_when_agents_exist(test_space, test_user):
    from DAO.db import rls_connection
    from DAO.org import service as org_service

    async with rls_connection(space_id=test_space.id, user_id=test_user["id"]) as conn:
        before = await conn.fetchval("SELECT count(*) FROM agents WHERE space_id = $1", test_space.id)
        assert before > 0
        await org_service.apply_template(
            conn,
            test_space.id,
            "growth",
            "Jarvis",
            replace=False,
        )
        after = await conn.fetchval("SELECT count(*) FROM agents WHERE space_id = $1", test_space.id)
        cfg = await org_service.get_org_config_row(conn, test_space.id)
    assert after >= before
    assert "marketing" in cfg["departments"]


@pytest.mark.asyncio
async def test_get_departments_view_defaults(test_space, test_user):
    from DAO.db import rls_connection

    async with rls_connection(space_id=test_space.id, user_id=test_user["id"]) as conn:
        view = await org_service.get_departments_view(conn, test_space.id)
    assert view["template_id"]
    dept_keys = [d["key"] for d in view["departments"]]
    for key in DEFAULT_DEPARTMENTS:
        assert key in dept_keys
