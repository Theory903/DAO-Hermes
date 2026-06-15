"""Auto writeback significant tool outputs to Space Drive when DAO runtime is bound."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone

from DAO.config import DAO_enabled
from DAO.db import rls_connection
from DAO.drive.store import store_text_object
from DAO.runtime import get_runtime_context

_log = logging.getLogger(__name__)

_WRITEBACK_TOOLS = frozenset(
    {
        "web_search",
        "web_extract",
        "read_file",
        "write_file",
        "delegate",
        "research",
    }
)
_MAX_WRITE_BYTES = 48_000


def maybe_DAO_tool_writeback(
    tool_name: str,
    args: dict | None,
    result: str,
) -> None:
    """Fire-and-forget hook from Hermes tool_complete_callback."""
    if not DAO_enabled():
        return
    ctx = get_runtime_context()
    if ctx is None or ctx.space_id is None:
        return
    if tool_name not in _WRITEBACK_TOOLS:
        return
    text = _result_text(result)
    if not text or len(text) < 80:
        return
    if len(text.encode("utf-8")) > _MAX_WRITE_BYTES:
        text = text[: _MAX_WRITE_BYTES] + "\n\n…(truncated for Drive writeback)"

    dept = (args or {}).get("department") or (args or {}).get("dept") or "ops"
    slug = _slugify(tool_name, args)
    path = f"/writeback/{datetime.now(timezone.utc):%Y/%m/%d}/{slug}.md"
    body = f"# Tool writeback: {tool_name}\n\n{text}"

    try:
        import asyncio

        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(_writeback_async(ctx.space_id, ctx.user_id, path, body, str(dept)))
        else:
            loop.run_until_complete(_writeback_async(ctx.space_id, ctx.user_id, path, body, str(dept)))
    except Exception as exc:
        _log.debug("DAO tool writeback skipped: %s", exc)


async def _writeback_async(space_id, user_id, path: str, content: str, dept: str) -> None:
    from uuid import UUID

    async with rls_connection(space_id=UUID(str(space_id)), user_id=UUID(str(user_id))) as conn:
        await store_text_object(
            conn,
            UUID(str(space_id)),
            path,
            content,
            produced_by_dept=dept,
        )


def _result_text(result: str) -> str:
    if not result:
        return ""
    try:
        parsed = json.loads(result)
        if isinstance(parsed, dict):
            for key in ("content", "text", "summary", "output", "result"):
                if key in parsed and parsed[key]:
                    return str(parsed[key])
        if isinstance(parsed, list):
            return json.dumps(parsed, indent=2)[: _MAX_WRITE_BYTES]
    except (json.JSONDecodeError, TypeError):
        pass
    return str(result).strip()


def _slugify(tool_name: str, args: dict | None) -> str:
    hint = ""
    if args:
        for key in ("query", "url", "path", "task", "intent"):
            if args.get(key):
                hint = str(args[key])[:40]
                break
    base = f"{tool_name}-{hint}" if hint else tool_name
    slug = re.sub(r"[^\w-]+", "-", base.lower()).strip("-")
    return slug[:64] or tool_name
