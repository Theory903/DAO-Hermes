"""Transparent proxy to Hermes /api/* handlers within the bound VPC context."""

from __future__ import annotations

import logging
from uuid import UUID

import httpx
from fastapi import APIRouter, Request, Response
from starlette.requests import ClientDisconnect

from DAO.hermes.internal_auth import DAO_PROXY_HEADER, DAO_proxy_auth_value

_log = logging.getLogger(__name__)

router = APIRouter(tags=["hermes-proxy"])

_HOP_BY_HOP = frozenset(
    {
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
        "host",
        "content-length",
    }
)


def _filter_request_headers(headers: dict[str, str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for key, value in headers.items():
        lower = key.lower()
        if lower in _HOP_BY_HOP:
            continue
        if lower == "authorization":
            continue
        out[key] = value
    return out


def _filter_response_headers(headers: httpx.Headers) -> dict[str, str]:
    return {
        k: v
        for k, v in headers.items()
        if k.lower() not in _HOP_BY_HOP
    }


async def _forward(request: Request, target_path: str) -> Response:
    if request.method in ("GET", "HEAD", "OPTIONS"):
        body = b""
    else:
        try:
            body = await request.body()
        except ClientDisconnect:
            # Browser/Electron aborted mid-request (common during Vite HMR reloads).
            return Response(status_code=499)
    query = request.url.query
    url = target_path
    if query:
        url = f"{url}?{query}"

    headers = _filter_request_headers(dict(request.headers))
    # In-process ASGI hop: DAO JWT was validated on the outer request.
    # Hermes loopback auth expects its session header; Host must match bind.
    from hermes_cli.web_server import _SESSION_HEADER_NAME, _SESSION_TOKEN

    headers[_SESSION_HEADER_NAME] = _SESSION_TOKEN
    headers[DAO_PROXY_HEADER] = DAO_proxy_auth_value()
    bound_host = getattr(request.app.state, "bound_host", None) or "127.0.0.1"
    port = request.url.port
    if port and port not in (80, 443):
        headers["Host"] = f"{bound_host}:{port}"
    else:
        headers["Host"] = str(bound_host)

    transport = httpx.ASGITransport(app=request.app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://127.0.0.1") as client:
        upstream = await client.request(
            request.method,
            url,
            content=body if body else None,
            headers=headers,
        )

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=_filter_response_headers(upstream.headers),
        media_type=upstream.headers.get("content-type"),
    )


@router.api_route(
    "/spaces/{space_id}/hermes-api/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
)
async def proxy_hermes_api(request: Request, space_id: UUID, path: str):
    """Forward to native Hermes REST handlers while SpaceContextMiddleware holds VPC bind."""
    _ = space_id
    return await _forward(request, f"/api/{path}")


@router.api_route(
    "/spaces/{space_id}/hermes-plugins/{path:path}",
    methods=["GET", "HEAD"],
)
async def proxy_hermes_plugins(request: Request, space_id: UUID, path: str):
    _ = space_id
    return await _forward(request, f"/dashboard-plugins/{path}")
