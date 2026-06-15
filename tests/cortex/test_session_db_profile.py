"""Session DB profile resolution under DAO runtime bind."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import pytest

from DAO.runtime import RuntimeContext, bind_hermes_runtime, unbind_hermes_runtime
from hermes_cli.web_server import _open_session_db_for_profile
from hermes_constants import get_hermes_home, set_hermes_home_override


@pytest.fixture
def vpc_home(tmp_path: Path) -> Path:
    home = tmp_path / "vpc"
    home.mkdir()
    return home


def test_open_session_db_uses_bound_home_when_dao_context_set(vpc_home: Path, tmp_path: Path):
    profile_home = tmp_path / "profile"
    profile_home.mkdir()
    (profile_home / "state.db").touch()

    uid = uuid4()
    sid = uuid4()
    handle = bind_hermes_runtime(user_id=uid, space_id=sid, tier="solo")
    set_hermes_home_override(str(vpc_home))
    try:
        with patch("hermes_cli.web_server._cron_profile_home", return_value=("default", str(profile_home))):
            db = _open_session_db_for_profile("default")
            try:
                assert db.db_path == vpc_home / "state.db"
            finally:
                db.close()
    finally:
        unbind_hermes_runtime(handle)


def test_open_session_db_uses_profile_home_without_dao_context(tmp_path: Path):
    profile_home = tmp_path / "profile"
    profile_home.mkdir()

    with patch("hermes_cli.web_server._cron_profile_home", return_value=("default", str(profile_home))):
        db = _open_session_db_for_profile("default")
        try:
            assert db.db_path == profile_home / "state.db"
        finally:
            db.close()
