"""Health check routes."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    from DAO.config import DAO_deployment, DAO_hermes_vpc_mode, s3_configured

    return {
        "status": "ok",
        "service": "DAO-api",
        "deployment": DAO_deployment(),
        "hermes_vpc_mode": DAO_hermes_vpc_mode(),
        "blob_backend": "s3" if s3_configured() else "local",
    }


@router.get("/health/ready")
async def readiness():
    """Liveness vs readiness: DB must answer before traffic is routed here."""
    from DAO.config import DAO_deployment, redis_url

    checks: dict[str, str] = {}
    ok = True

    try:
        from DAO.db import get_pool

        pool = get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        checks["postgres"] = "ok"
    except Exception as exc:
        checks["postgres"] = str(exc)
        ok = False

    if DAO_deployment() == "cloud":
        if not redis_url():
            checks["redis"] = "missing REDIS_URL"
            ok = False
        else:
            try:
                import redis

                r = redis.from_url(redis_url())
                r.ping()
                checks["redis"] = "ok"
            except Exception as exc:
                checks["redis"] = str(exc)
                ok = False

    body = {"status": "ready" if ok else "degraded", "checks": checks}
    if not ok:
        return JSONResponse(status_code=503, content=body)
    return body
