"""httpOnly session cookie helpers."""

from __future__ import annotations

from fastapi import Response

from DAO.config import DAO_deployment, jwt_expiry_hours

COOKIE_NAME = "DAO_token"


def _secure_flag() -> bool:
    return DAO_deployment() == "cloud"


def attach_auth_cookie(response: Response, token: str) -> None:
    max_age = jwt_expiry_hours() * 3600
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=_secure_flag(),
        samesite="lax",
        max_age=max_age,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/")
