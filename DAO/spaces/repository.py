"""Space CRUD repository."""

from __future__ import annotations

import json
from uuid import UUID

import asyncpg

from DAO.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from DAO.vpc import normalize_tier, provision_org_shared, tier_from_operating_mode
from DAO.spaces.models import Space, SpaceCreate, SpaceMember, SpaceUpdate
from DAO.spaces.provision import (
    DEFAULT_AI_LEAD_CONFIG,
    generate_dek,
    provision_filesystem,
    seed_default_org,
    slugify,
)


async def list_spaces_for_user(conn: asyncpg.Connection, user_id: UUID) -> list[Space]:
    rows = await conn.fetch(
        """
        SELECT s.id, s.org_id, s.name, s.slug, s.tier, s.operating_mode,
               s.ai_lead_config, s.created_at
        FROM spaces s
        JOIN space_members sm ON sm.space_id = s.id
        WHERE sm.user_id = $1
        ORDER BY s.created_at DESC
        """,
        user_id,
    )
    return [_row_to_space(r) for r in rows]


async def get_space(conn: asyncpg.Connection, space_id: UUID) -> Space:
    row = await conn.fetchrow(
        """
        SELECT id, org_id, name, slug, tier, operating_mode, ai_lead_config, created_at
        FROM spaces WHERE id = $1
        """,
        space_id,
    )
    if row is None:
        raise NotFoundError("Space not found")
    return _row_to_space(row)


async def create_space(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    payload: SpaceCreate,
) -> Space:
    slug = payload.slug or slugify(payload.name)
    existing = await conn.fetchval("SELECT id FROM spaces WHERE slug = $1", slug)
    if existing:
        raise ConflictError("Space slug already exists", details={"slug": slug})

    ai_config = dict(DEFAULT_AI_LEAD_CONFIG)
    ai_config["name"] = payload.ai_lead_name
    if payload.mission:
        ai_config["mission"] = payload.mission

    operating_mode = payload.operating_mode or "jarvis"
    tier = normalize_tier(payload.tier) if payload.tier else tier_from_operating_mode(operating_mode)

    async with conn.transaction():
        org_id = await conn.fetchval(
            """
            INSERT INTO organizations (name, billing_tier)
            VALUES ($1, $2)
            RETURNING id
            """,
            payload.name,
            tier,
        )
        space_id = await conn.fetchval(
            """
            INSERT INTO spaces (org_id, name, slug, tier, operating_mode, ai_lead_config)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb)
            RETURNING id
            """,
            org_id,
            payload.name,
            slug,
            tier,
            operating_mode,
            json.dumps(ai_config),
        )
        await conn.execute(
            """
            INSERT INTO space_members (space_id, user_id, role)
            VALUES ($1, $2, 'owner')
            """,
            space_id,
            user_id,
        )
        await generate_dek(conn, space_id)
        await seed_default_org(conn, space_id, payload.ai_lead_name)

    provision_filesystem(space_id, tier=tier)
    if tier == "enterprise":
        provision_org_shared(org_id)

    try:
        from DAO.cron.sync import sync_space_automations_to_cron

        await sync_space_automations_to_cron(space_id, owner_id=user_id, tier=tier)
    except Exception:
        pass  # cron sync is best-effort at create time

    row = await conn.fetchrow(
        """
        SELECT id, org_id, name, slug, tier, operating_mode, ai_lead_config, created_at
        FROM spaces WHERE id = $1
        """,
        space_id,
    )
    return _row_to_space(row)


async def update_space(
    conn: asyncpg.Connection,
    space_id: UUID,
    payload: SpaceUpdate,
) -> Space:
    current = await get_space(conn, space_id)
    name = payload.name if payload.name is not None else current.name
    operating_mode = (
        payload.operating_mode
        if payload.operating_mode is not None
        else current.operating_mode
    )
    ai_lead_config = (
        payload.ai_lead_config
        if payload.ai_lead_config is not None
        else current.ai_lead_config
    )
    await conn.execute(
        """
        UPDATE spaces
        SET name = $2, operating_mode = $3, ai_lead_config = $4::jsonb
        WHERE id = $1
        """,
        space_id,
        name,
        operating_mode,
        json.dumps(ai_lead_config),
    )
    return await get_space(conn, space_id)


async def list_space_members(conn: asyncpg.Connection, space_id: UUID) -> list[SpaceMember]:
    rows = await conn.fetch(
        """
        SELECT sm.id, sm.user_id, u.email, u.display_name, sm.role, sm.created_at
        FROM space_members sm
        JOIN users u ON u.id = sm.user_id
        WHERE sm.space_id = $1
        ORDER BY sm.created_at ASC
        """,
        space_id,
    )
    return [_row_to_member(r) for r in rows]


async def invite_space_member(
    conn: asyncpg.Connection,
    space_id: UUID,
    *,
    email: str,
    role: str,
) -> SpaceMember:
    if role == "owner":
        raise ValidationError("Cannot invite as owner")

    email = email.lower().strip()
    async with conn.transaction():
        user_row = await conn.fetchrow(
            "SELECT id, email, display_name FROM users WHERE email = $1::text::citext",
            email,
        )
        if user_row is None:
            display_name = email.split("@")[0]
            user_id = await conn.fetchval(
                """
                INSERT INTO users (email, display_name, oauth_provider, oauth_subject)
                VALUES ($1::text::citext, $2::text, 'invite', $3::text)
                RETURNING id
                """,
                email,
                display_name,
                email,
            )
            user_row = await conn.fetchrow(
                "SELECT id, email, display_name FROM users WHERE id = $1",
                user_id,
            )

        existing = await conn.fetchrow(
            """
            SELECT id FROM space_members
            WHERE space_id = $1 AND user_id = $2
            """,
            space_id,
            user_row["id"],
        )
        if existing is not None:
            raise ConflictError("User is already a member of this Space")

        member_id = await conn.fetchval(
            """
            INSERT INTO space_members (space_id, user_id, role)
            VALUES ($1, $2, $3)
            RETURNING id
            """,
            space_id,
            user_row["id"],
            role,
        )

    row = await conn.fetchrow(
        """
        SELECT sm.id, sm.user_id, u.email, u.display_name, sm.role, sm.created_at
        FROM space_members sm
        JOIN users u ON u.id = sm.user_id
        WHERE sm.id = $1
        """,
        member_id,
    )
    return _row_to_member(row)


async def update_space_member_role(
    conn: asyncpg.Connection,
    space_id: UUID,
    member_id: UUID,
    role: str,
) -> SpaceMember:
    if role == "owner":
        raise ValidationError("Use ownership transfer to assign owner")

    row = await conn.fetchrow(
        """
        SELECT sm.id, sm.role, sm.user_id
        FROM space_members sm
        WHERE sm.id = $1 AND sm.space_id = $2
        """,
        member_id,
        space_id,
    )
    if row is None:
        raise NotFoundError("Member not found")
    if row["role"] == "owner":
        raise ForbiddenError("Cannot change the Space owner's role")

    await conn.execute(
        "UPDATE space_members SET role = $3 WHERE id = $1 AND space_id = $2",
        member_id,
        space_id,
        role,
    )
    updated = await conn.fetchrow(
        """
        SELECT sm.id, sm.user_id, u.email, u.display_name, sm.role, sm.created_at
        FROM space_members sm
        JOIN users u ON u.id = sm.user_id
        WHERE sm.id = $1
        """,
        member_id,
    )
    return _row_to_member(updated)


async def remove_space_member(
    conn: asyncpg.Connection,
    space_id: UUID,
    member_id: UUID,
) -> SpaceMember:
    row = await conn.fetchrow(
        """
        SELECT sm.id, sm.user_id, sm.role, u.email, u.display_name, sm.created_at
        FROM space_members sm
        JOIN users u ON u.id = sm.user_id
        WHERE sm.id = $1 AND sm.space_id = $2
        """,
        member_id,
        space_id,
    )
    if row is None:
        raise NotFoundError("Member not found")
    if row["role"] == "owner":
        owner_count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM space_members
            WHERE space_id = $1 AND role = 'owner'
            """,
            space_id,
        )
        if owner_count <= 1:
            raise ForbiddenError("Cannot remove the only Space owner")

    await conn.execute(
        "DELETE FROM space_members WHERE id = $1 AND space_id = $2",
        member_id,
        space_id,
    )
    return _row_to_member(row)


def _row_to_member(row: asyncpg.Record) -> SpaceMember:
    return SpaceMember(
        id=row["id"],
        user_id=row["user_id"],
        email=str(row["email"]),
        display_name=row["display_name"],
        role=row["role"],
        created_at=row["created_at"],
    )


def _row_to_space(row: asyncpg.Record) -> Space:
    cfg = row["ai_lead_config"]
    if isinstance(cfg, str):
        cfg = json.loads(cfg)
    return Space(
        id=row["id"],
        org_id=row["org_id"],
        name=row["name"],
        slug=row["slug"],
        tier=row["tier"],
        operating_mode=row["operating_mode"],
        ai_lead_config=cfg,
        created_at=row["created_at"],
    )
