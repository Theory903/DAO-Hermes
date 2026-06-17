"""Mount DAO routers and middleware on FastAPI app."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from DAO.config import DAO_enabled, validate_production_config
from DAO.db import close_pool, init_pool
from DAO.middleware.rate_limit import AuthRateLimitMiddleware
from DAO.middleware.stack import DAOErrorMiddleware, SpaceContextMiddleware
from DAO.auth.router import AuthMiddleware, router as auth_router
from DAO.auth.ws_ticket import router as ws_ticket_router
from DAO.health.router import router as health_router
from DAO.spaces.router import router as spaces_router
from DAO.drive.router import router as drive_router
from DAO.org.router import router as org_router
from DAO.jarvis.router import router as jarvis_router
from DAO.jarvis.home_router import router as home_router
from DAO.comms.router import router as comms_router
from DAO.hitl.router import router as hitl_router
from DAO.hitl.gate import register_hitl_gate
from DAO.canvas.router import router as canvas_router
from DAO.council.router import router as council_router
from DAO.skills.router import router as skills_router
from DAO.tools.router import router as tools_router
from DAO.enclave.router import router as enclave_router
from DAO.hermes.router import router as hermes_router
from DAO.research_memory.router import router as research_memory_router
from DAO.objects.router import router as objects_router
from DAO.work.router import router as work_router
from DAO.memory.router import router as memory_router
from DAO.wiki.router import router as wiki_router

_log = logging.getLogger(__name__)

_DAO_lifespan_started = False


@asynccontextmanager
async def DAO_lifespan(app: FastAPI):
    validate_production_config()
    await init_pool()
    try:
        from DAO.cron.sync import reconcile_all_automation_cron_jobs

        await reconcile_all_automation_cron_jobs()
    except Exception as exc:
        _log.warning("DAO automation cron reconcile skipped: %s", exc)
    _log.info("DAO API layer ready")
    try:
        yield
    finally:
        await close_pool()


def mount_DAO(app: FastAPI) -> None:
    """Attach DAO company layer to the Hermes FastAPI app."""
    if not DAO_enabled():
        _log.info("DAO API disabled (set DAO_API_ENABLED=1 to enable)")
        return

    app.add_middleware(DAOErrorMiddleware)
    app.add_middleware(SpaceContextMiddleware)
    app.add_middleware(AuthRateLimitMiddleware)
    app.add_middleware(AuthMiddleware)

    prefix = "/api/v1"
    app.include_router(health_router, prefix=prefix)
    app.include_router(auth_router, prefix=prefix)
    app.include_router(spaces_router, prefix=prefix)
    app.include_router(ws_ticket_router, prefix=prefix)
    app.include_router(drive_router, prefix=prefix)
    app.include_router(research_memory_router, prefix=prefix)
    app.include_router(org_router, prefix=prefix)
    app.include_router(jarvis_router, prefix=prefix)
    app.include_router(home_router, prefix=prefix)
    app.include_router(comms_router, prefix=prefix)
    app.include_router(hitl_router, prefix=prefix)
    app.include_router(canvas_router, prefix=prefix)
    app.include_router(council_router, prefix=prefix)
    app.include_router(skills_router, prefix=prefix)
    app.include_router(tools_router, prefix=prefix)
    app.include_router(enclave_router, prefix=prefix)
    app.include_router(hermes_router, prefix=prefix)
    app.include_router(wiki_router, prefix=prefix)
    app.include_router(objects_router, prefix=prefix)
    app.include_router(work_router, prefix=prefix)
    app.include_router(memory_router, prefix=prefix)

    register_hitl_gate()
    _log.info("DAO routes mounted at %s", prefix)
