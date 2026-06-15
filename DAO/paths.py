"""Canonical DAO filesystem layout.

Layout (under ``DAO_DATA_ROOT``, default ``./data``)::

    vpcs/users/{user_id}/       personal Hermes VPC
    spaces/{space_id}/drive/    company drive blobs
    spaces/{space_id}/shared/   team + enterprise shared Hermes assets
    orgs/{org_id}/shared/       enterprise org-wide assets

Legacy (``DAO_DATA_ROOT=./data/spaces``): ``{root}/{space_id}/`` still resolved.
"""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

from DAO.config import DAO_data_root


def user_vpc_dir(user_id: UUID | str) -> Path:
    root = DAO_data_root()
    canonical = root / "vpcs" / "users" / str(user_id)
    legacy = root / "vpcs" / str(user_id)
    if legacy.exists() and not canonical.parent.exists():
        return legacy
    return canonical


def space_dir(space_id: UUID | str) -> Path:
    root = DAO_data_root()
    canonical = root / "spaces" / str(space_id)
    legacy = root / str(space_id)
    if legacy.is_dir() and not (root / "spaces").is_dir():
        return legacy
    return canonical


def space_drive_dir(space_id: UUID | str) -> Path:
    return space_dir(space_id) / "drive"


def space_shared_dir(space_id: UUID | str) -> Path:
    return space_dir(space_id) / "shared"


def org_dir(org_id: UUID | str) -> Path:
    return DAO_data_root() / "orgs" / str(org_id)


def org_shared_dir(org_id: UUID | str) -> Path:
    return org_dir(org_id) / "shared"
