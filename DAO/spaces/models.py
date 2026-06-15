"""Space models."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class AILeadConfig(BaseModel):
    name: str = "Jarvis"
    persona: str = "Direct, proactive COO"
    hitl_policy: dict[str, Any] = Field(default_factory=lambda: {
        "deploy": True,
        "spend_over_usd": 50,
        "external_email": True,
    })
    default_model_tier: int = 2


class SpaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: str | None = Field(default=None, pattern=r"^[a-z0-9-]{2,64}$")
    ai_lead_name: str = "Jarvis"
    mission: str | None = None
    operating_mode: str = "jarvis"
    tier: str | None = None


class SpaceUpdate(BaseModel):
    name: str | None = None
    operating_mode: str | None = None
    ai_lead_config: dict[str, Any] | None = None


class Space(BaseModel):
    id: UUID
    org_id: UUID
    name: str
    slug: str
    tier: str
    operating_mode: str
    ai_lead_config: dict[str, Any]
    created_at: datetime


class SpaceMember(BaseModel):
    id: UUID
    user_id: UUID
    email: str
    display_name: str | None = None
    role: str
    created_at: datetime


class SpaceMemberUpdate(BaseModel):
    role: str = Field(pattern="^(admin|member|viewer)$")
