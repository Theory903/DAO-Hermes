"""Tier-aware Hermes runtime binding (solo / team / enterprise)."""

from __future__ import annotations

import logging
from contextvars import ContextVar, Token
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import UUID

from hermes_constants import get_hermes_home, reset_hermes_home_override, set_hermes_home_override

from DAO.config import DAO_deployment, DAO_hermes_vpc_mode
from DAO.paths import org_shared_dir, space_shared_dir, user_vpc_dir
from DAO.vpc import (
    Tier,
    normalize_tier,
    provision_org_shared,
    provision_space_shared,
    provision_user_vpc,
    resolve_personal_home,
    wire_shared_assets,
)

if TYPE_CHECKING:
    pass

_log = logging.getLogger(__name__)

_RUNTIME_CTX: ContextVar[RuntimeContext | None] = ContextVar("_DAO_runtime", default=None)


@dataclass(frozen=True)
class RuntimeContext:
    user_id: UUID
    space_id: UUID | None
    org_id: UUID | None
    tier: Tier
    deployment: str
    vpc_mode: str
    personal_home: Path
    space_shared: Path | None
    org_shared: Path | None
    space_name: str | None = None
    lead_name: str | None = None
    mission: str | None = None


@dataclass
class HermesBindHandle:
    home_token: Token | None
    runtime_token: Token | None


def get_runtime_context() -> RuntimeContext | None:
    return _RUNTIME_CTX.get()


def bind_hermes_runtime(
    *,
    user_id: UUID | str,
    space_id: UUID | str | None = None,
    org_id: UUID | str | None = None,
    tier: str | Tier = "solo",
    space_name: str | None = None,
    lead_name: str | None = None,
    mission: str | None = None,
) -> HermesBindHandle:
    """Bind Hermes to the correct personal + shared layout for this request."""
    mode = DAO_hermes_vpc_mode()
    tier_norm = normalize_tier(tier)
    uid = UUID(str(user_id)) if not isinstance(user_id, UUID) else user_id
    space_meta = {
        "space_name": space_name,
        "lead_name": lead_name,
        "mission": mission,
    }

    if mode == "shared":
        ctx = RuntimeContext(
            user_id=uid,
            space_id=UUID(str(space_id)) if space_id else None,
            org_id=UUID(str(org_id)) if org_id else None,
            tier=tier_norm,
            deployment=DAO_deployment(),
            vpc_mode=mode,
            personal_home=get_hermes_home(),
            space_shared=None,
            org_shared=None,
            **space_meta,
        )
        return HermesBindHandle(None, _RUNTIME_CTX.set(ctx))

    if mode == "space":
        if space_id is None:
            return HermesBindHandle(None, None)
        from DAO.paths import space_dir

        home = space_dir(space_id)
        home.mkdir(parents=True, exist_ok=True)
        ctx = RuntimeContext(
            user_id=uid,
            space_id=UUID(str(space_id)),
            org_id=UUID(str(org_id)) if org_id else None,
            tier=tier_norm,
            deployment=DAO_deployment(),
            vpc_mode=mode,
            personal_home=home,
            space_shared=None,
            org_shared=None,
            **space_meta,
        )
        return HermesBindHandle(set_hermes_home_override(str(home)), _RUNTIME_CTX.set(ctx))

    # user VPC mode (default)
    personal = resolve_personal_home(uid, tier_norm)
    provision_user_vpc(uid, tier_norm)

    sid = UUID(str(space_id)) if space_id else None
    oid = UUID(str(org_id)) if org_id else None
    space_shared = space_shared_dir(sid) if sid and tier_norm in ("team", "enterprise") else None
    org_shared = org_shared_dir(oid) if oid and tier_norm == "enterprise" else None

    if sid and tier_norm in ("team", "enterprise"):
        provision_space_shared(sid, tier_norm)
        wire_shared_assets(personal, sid, tier_norm)
    if oid and tier_norm == "enterprise":
        provision_org_shared(oid)
        wire_shared_assets(personal, sid, tier_norm, org_id=oid)

    ctx = RuntimeContext(
        user_id=uid,
        space_id=sid,
        org_id=oid,
        tier=tier_norm,
        deployment=DAO_deployment(),
        vpc_mode=mode,
        personal_home=personal,
        space_shared=space_shared,
        org_shared=org_shared,
        **space_meta,
    )
    return HermesBindHandle(set_hermes_home_override(str(personal)), _RUNTIME_CTX.set(ctx))


def unbind_hermes_runtime(handle: HermesBindHandle | None) -> None:
    if handle is None:
        return
    if handle.home_token is not None:
        reset_hermes_home_override(handle.home_token)
    if handle.runtime_token is not None:
        _RUNTIME_CTX.reset(handle.runtime_token)


def runtime_context_payload(ctx: RuntimeContext | None) -> dict:
    if ctx is None:
        return {}
    return {
        "hermes_vpc_mode": ctx.vpc_mode,
        "deployment": ctx.deployment,
        "tier": ctx.tier,
        "personal_home": str(ctx.personal_home),
        "space_shared": str(ctx.space_shared) if ctx.space_shared else None,
        "org_shared": str(ctx.org_shared) if ctx.org_shared else None,
        "space_name": ctx.space_name,
        "lead_name": ctx.lead_name,
        "mission": ctx.mission,
    }
