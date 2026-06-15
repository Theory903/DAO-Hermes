"""Production configuration and auth hardening tests."""

from __future__ import annotations

import pytest
from starlette.responses import Response

from DAO.auth.router import DevLoginRequest, dev_login
from DAO.config import DAO_deployment, validate_production_config
from DAO.exceptions import ForbiddenError


def test_DAO_deployment_maps_development_to_local(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("DAO_ENV", "development")
    assert DAO_deployment() == "local"


def test_validate_production_rejects_weak_jwt(monkeypatch):
    monkeypatch.setenv("DAO_API_ENABLED", "1")
    monkeypatch.setenv("DAO_ENV", "cloud")
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@db.example.com/DAO")
    monkeypatch.setenv("JWT_SECRET", "dev-change-me")
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        validate_production_config()


def test_validate_production_requires_redis(monkeypatch):
    monkeypatch.setenv("DAO_API_ENABLED", "1")
    monkeypatch.setenv("DAO_ENV", "cloud")
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@db.example.com/DAO")
    monkeypatch.setenv("JWT_SECRET", "x" * 40)
    monkeypatch.delenv("REDIS_URL", raising=False)
    with pytest.raises(RuntimeError, match="REDIS_URL"):
        validate_production_config()


@pytest.mark.asyncio
async def test_dev_login_blocked_in_cloud(monkeypatch):
    monkeypatch.setattr("DAO.auth.router.DAO_deployment", lambda: "cloud")
    with pytest.raises(ForbiddenError):
        await dev_login(DevLoginRequest(email="blocked@example.com"), Response())
