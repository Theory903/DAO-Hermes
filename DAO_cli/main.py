#!/usr/bin/env python3
"""DAO OS CLI — thin wrapper over Hermes with company layer enabled."""

from __future__ import annotations

import argparse
import os
import sys


def cmd_api(args: argparse.Namespace) -> None:
    os.environ.setdefault("DAO_API_ENABLED", "1")
    from hermes_cli.web_server import start_server

    start_server(
        host=args.host,
        port=args.port,
        open_browser=not args.no_open,
        allow_public=args.insecure,
        initial_profile="",
    )


def cmd_workers(args: argparse.Namespace) -> None:
    import asyncio
    from uuid import UUID

    from DAO.workers.briefing import run_briefing

    async def _run() -> None:
        result = await run_briefing(UUID(args.space_id))
        print(result)

    asyncio.run(_run())


def main() -> None:
    parser = argparse.ArgumentParser(prog="DAO", description="DAO OS CLI")
    sub = parser.add_subparsers(dest="command")

    api = sub.add_parser("api", help="Start DAO API server")
    api.add_argument("--host", default="127.0.0.1")
    api.add_argument("--port", type=int, default=9119)
    api.add_argument("--reload", action="store_true", help="Dev reload (uvicorn)")
    api.add_argument("--no-open", action="store_true", help="Do not open browser")
    api.add_argument(
        "--insecure",
        action="store_true",
        help="Allow public bind (0.0.0.0)",
    )
    api.set_defaults(func=cmd_api)

    workers = sub.add_parser("workers", help="Run background workers")
    workers_sub = workers.add_subparsers(dest="worker")
    briefing = workers_sub.add_parser("briefing", help="Run briefing worker")
    briefing.add_argument("--space-id", required=True)
    briefing.set_defaults(func=cmd_workers)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)
    args.func(args)


if __name__ == "__main__":
    main()
