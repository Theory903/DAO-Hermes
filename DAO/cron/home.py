"""Bind Hermes home + cron/jobs module paths for a Space owner VPC."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator
from uuid import UUID

from hermes_constants import get_hermes_home

from DAO.runtime import HermesBindHandle, bind_hermes_runtime, unbind_hermes_runtime


@contextmanager
def cron_jobs_home(
    *,
    user_id: UUID,
    space_id: UUID | None = None,
    tier: str = "solo",
) -> Iterator[HermesBindHandle]:
    """Point ``cron.jobs`` at the owner's Hermes VPC while bound to a Space."""
    import cron.jobs as jobs_mod

    handle = bind_hermes_runtime(user_id=user_id, space_id=space_id, tier=tier)
    home = get_hermes_home().resolve()
    cron_dir = home / "cron"
    cron_dir.mkdir(parents=True, exist_ok=True)

    previous = (
        jobs_mod.HERMES_DIR,
        jobs_mod.CRON_DIR,
        jobs_mod.JOBS_FILE,
        jobs_mod.OUTPUT_DIR,
    )
    jobs_mod.HERMES_DIR = home
    jobs_mod.CRON_DIR = cron_dir
    jobs_mod.JOBS_FILE = cron_dir / "jobs.json"
    jobs_mod.OUTPUT_DIR = cron_dir / "output"
    jobs_mod.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    try:
        yield handle
    finally:
        jobs_mod.HERMES_DIR, jobs_mod.CRON_DIR, jobs_mod.JOBS_FILE, jobs_mod.OUTPUT_DIR = (
            previous
        )
        unbind_hermes_runtime(handle)
