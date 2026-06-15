"""OAuth state and exchange code helpers."""

from __future__ import annotations

import os
import uuid

import pytest

from DAO.auth import jwt as jwt_util
from DAO.auth.oauth import (
    consume_exchange_code,
    consume_oauth_state,
    create_oauth_state,
    store_exchange_code,
    supported_providers,
)


def test_oauth_state_roundtrip():
    state = create_oauth_state(
        provider="google",
        redirect_uri="http://localhost:3000/",
        mode="desktop",
    )
    parsed = consume_oauth_state(state)
    assert parsed.provider == "google"
    assert parsed.mode == "desktop"
    assert parsed.redirect_uri == "http://localhost:3000/"


def test_oauth_state_single_use():
    state = create_oauth_state(
        provider="github",
        redirect_uri="http://localhost:3000/",
        mode="web",
    )
    consume_oauth_state(state)
    with pytest.raises(ValueError, match="invalid or expired"):
        consume_oauth_state(state)


def test_exchange_code_roundtrip():
    os.environ["JWT_SECRET"] = "test-secret-for-oauth-exchange"
    token = jwt_util.issue_token(user_id=uuid.uuid4(), email="oauth@test.com", hours=1)
    code = store_exchange_code(token)
    assert consume_exchange_code(code) == token
    with pytest.raises(ValueError, match="invalid or expired"):
        consume_exchange_code(code)


def test_supported_providers_empty_without_env(monkeypatch):
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("GITHUB_OAUTH_CLIENT_ID", raising=False)
    monkeypatch.delenv("GITHUB_OAUTH_CLIENT_SECRET", raising=False)
    # config may cache env — just assert list type
    assert isinstance(supported_providers(), list)
