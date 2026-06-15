"""Space provisioning — filesystem, keys, default org seed."""

from __future__ import annotations

import os
from pathlib import Path
from uuid import UUID

from DAO.org.catalog import DEFAULT_DEPARTMENTS, DEFAULT_TEMPLATE_ID
from DAO.org.service import seed_org
from DAO.paths import space_dir, space_drive_dir
from DAO.vpc import Tier, normalize_tier, provision_space_shared


def provision_filesystem(space_id: UUID, *, tier: Tier = "solo") -> Path:
    """Create space company-data dirs; shared Hermes assets for team/enterprise."""
    home = space_dir(space_id)
    space_drive_dir(space_id).mkdir(parents=True, exist_ok=True)
    tier_norm = normalize_tier(tier)
    if tier_norm in ("team", "enterprise"):
        provision_space_shared(space_id, tier_norm)
    return home


async def generate_dek(conn, space_id: UUID) -> None:
    dek = os.urandom(32)
    await conn.execute(
        """
        INSERT INTO space_keys (space_id, dek_encrypted)
        VALUES ($1, $2)
        ON CONFLICT (space_id) DO NOTHING
        """,
        space_id,
        dek,
    )


DEFAULT_AI_LEAD_CONFIG = {
    "name": "Jarvis",
    "persona": "Direct, proactive COO",
    "hitl_policy": {
        "deploy": True,
        "spend_over_usd": 50,
        "external_email": True,
    },
    "default_model_tier": 2,
}


async def seed_default_org(conn, space_id: UUID, ai_lead_name: str) -> None:
    await seed_org(
        conn,
        space_id,
        ai_lead_name,
        DEFAULT_DEPARTMENTS,
        template_id=DEFAULT_TEMPLATE_ID,
    )


def slugify(name: str) -> str:
    import re
    import secrets

    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:64] or secrets.token_hex(4)
