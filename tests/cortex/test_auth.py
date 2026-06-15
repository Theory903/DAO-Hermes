"""Integration tests for DAO spaces API."""

from __future__ import annotations

import os
import uuid

import pytest

pytest.importorskip("asyncpg")

from DAO.auth import jwt as jwt_util


@pytest.mark.asyncio
async def test_jwt_roundtrip():
    os.environ["JWT_SECRET"] = "test-secret-for-unit-tests"
    uid = uuid.uuid4()
    token = jwt_util.issue_token(user_id=uid, email="test@example.com", hours=1)
    claims = jwt_util.verify_token(token)
    assert claims["sub"] == str(uid)
    assert claims["email"] == "test@example.com"


def test_DAO_enabled_env():
    os.environ["DAO_API_ENABLED"] = "1"
    from DAO.config import DAO_enabled

    assert DAO_enabled() is True
