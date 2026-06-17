#!/usr/bin/env python3
"""Backfill Company Graph objects for one or all spaces."""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

from DAO.db import admin_connection, close_pool, init_pool, rls_connection
from DAO.objects.backfill import backfill_space


async def _run(space_id: str | None) -> int:
    await init_pool()
    try:
        if space_id:
            from uuid import UUID

            sid = UUID(space_id)
            async with rls_connection(space_id=sid) as conn:
                stats = await backfill_space(conn, sid)
            print(
                f"space={sid} ingested={stats.total_ingested()} skipped={stats.skipped}"
            )
            return 0

        async with admin_connection() as conn:
            rows = await conn.fetch("SELECT id FROM spaces ORDER BY created_at ASC")
        for row in rows:
            sid = row["id"]
            async with rls_connection(space_id=sid) as conn:
                stats = await backfill_space(conn, sid)
            print(
                f"space={sid} ingested={stats.total_ingested()} skipped={stats.skipped}"
            )
        return 0
    finally:
        await close_pool()


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill Company Graph from source tables")
    parser.add_argument("--space-id", help="Single space UUID (default: all spaces)")
    args = parser.parse_args()
    if not os.environ.get("DATABASE_URL"):
        print("DATABASE_URL is required", file=sys.stderr)
        sys.exit(1)
    raise SystemExit(asyncio.run(_run(args.space_id)))


if __name__ == "__main__":
    main()
