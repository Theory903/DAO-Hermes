"""FastAPI dependencies for DAO routes."""

from __future__ import annotations

from uuid import UUID

from fastapi import Request

from DAO.exceptions import ForbiddenError


def current_user_id(request: Request) -> UUID:
    return request.state.user["id"]


def current_space_id(request: Request) -> UUID:
    sid = getattr(request.state, "space_id", None)
    if sid is None:
        raise ForbiddenError("Space context required")
    return sid


def current_space_role(request: Request) -> str:
    return getattr(request.state, "space_role", "viewer")


def require_space_role(request: Request, *roles: str) -> str:
    """Raise ForbiddenError unless the caller has one of the allowed roles."""
    role = current_space_role(request)
    if role not in roles:
        raise ForbiddenError(f"Requires one of: {', '.join(roles)}")
    return role
