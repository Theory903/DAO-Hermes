"""Personal VPC — tier-aware Hermes homes (solo / team / enterprise)."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Literal
from uuid import UUID

from hermes_constants import get_hermes_home

from DAO.config import DAO_deployment, env
from DAO.paths import org_shared_dir, space_shared_dir, user_vpc_dir

_log = logging.getLogger(__name__)

Tier = Literal["solo", "team", "enterprise"]

_PERSONAL_SUBDIRS = (
    "sqlite",
    "skills",
    "cron",
    "tmp",
    "logs",
    "sessions",
    "memories",
    "plugins",
)

_SPACE_SHARED_SUBDIRS = ("skills", "plugins", "config.d", "tools")
_ORG_SHARED_SUBDIRS = ("skills", "plugins", "policies", "config.d")


def normalize_tier(tier: str | Tier) -> Tier:
    value = (tier or "solo").lower()
    if value in ("jarvis", "solo"):
        return "solo"
    if value in ("team", "enterprise"):
        return value
    return "solo"


def tier_from_operating_mode(operating_mode: str) -> Tier:
    return normalize_tier(operating_mode)


def resolve_personal_home(user_id: UUID | str, tier: Tier = "solo") -> Path:
    """Personal Hermes home for a user in the given space tier context."""
    override = env("DAO_PERSONAL_HERMES_HOME")
    if override:
        return Path(override).expanduser()

    # Local solo dev: reuse the same home as ``hermes configure`` / CLI.
    if DAO_deployment() == "local" and tier == "solo":
        return get_hermes_home()

    return user_vpc_dir(user_id)


def provision_user_vpc(user_id: UUID | str, tier: Tier = "solo") -> Path:
    home = resolve_personal_home(user_id, tier)
    for sub in _PERSONAL_SUBDIRS:
        (home / sub).mkdir(parents=True, exist_ok=True)
    return home


def vpc_home_for_user(user_id: UUID | str, tier: Tier = "solo") -> Path:
    home = resolve_personal_home(user_id, tier)
    if not home.exists():
        return provision_user_vpc(user_id, tier)
    for sub in _PERSONAL_SUBDIRS:
        (home / sub).mkdir(parents=True, exist_ok=True)
    return home


def provision_space_shared(space_id: UUID | str, tier: Tier) -> Path:
    root = space_shared_dir(space_id)
    for sub in _SPACE_SHARED_SUBDIRS:
        (root / sub).mkdir(parents=True, exist_ok=True)
    if tier == "enterprise":
        (root / "policies").mkdir(parents=True, exist_ok=True)
    return root


def provision_org_shared(org_id: UUID | str) -> Path:
    root = org_shared_dir(org_id)
    for sub in _ORG_SHARED_SUBDIRS:
        (root / sub).mkdir(parents=True, exist_ok=True)
    return root


def _link_shared_dir(personal: Path, link_name: str, target: Path) -> None:
    if not target.is_dir():
        return
    link = personal / "skills" / link_name
    if link.is_symlink():
        if link.resolve() == target.resolve():
            return
        link.unlink()
    elif link.exists():
        return
    try:
        link.symlink_to(target, target_is_directory=True)
    except OSError as exc:
        _log.debug("shared skills link skipped %s -> %s: %s", link, target, exc)


def wire_shared_assets(
    personal: Path,
    space_id: UUID | str | None,
    tier: Tier,
    *,
    org_id: UUID | str | None = None,
) -> None:
    """Expose team/enterprise shared skill trees inside the personal VPC."""
    (personal / "skills").mkdir(parents=True, exist_ok=True)
    if tier in ("team", "enterprise") and space_id is not None:
        _link_shared_dir(personal, "_space", space_shared_dir(space_id) / "skills")
    if tier == "enterprise" and org_id is not None:
        _link_shared_dir(personal, "_org", org_shared_dir(org_id) / "skills")
