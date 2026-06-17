"""DAO company-layer tools — navigate UI, list reports, read company pulse.

Registered into the Hermes tool schema only when a Space runtime is bound
(see ``_check_DAO_mode``). Uses existing jarvis_briefings, drive_objects,
hitl_requests, and the Command Center SSE bus — no parallel subsystems.
"""

from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID

from tools.registry import registry, tool_error

logger = logging.getLogger(__name__)

_VALID_SCREENS = frozenset({
    "home",
    "chat",
    "command",
    "drive",
    "brain",
    "wiki",
    "org",
    "inbox",
    "reports",
    "settings",
})


def _check_DAO_mode() -> bool:
    try:
        from DAO.config import DAO_enabled
        from DAO.runtime import get_runtime_context
    except ImportError:
        return False
    if not DAO_enabled():
        return False
    ctx = get_runtime_context()
    return ctx is not None and ctx.space_id is not None


def _require_space() -> tuple[UUID, UUID]:
    from DAO.runtime import get_runtime_context

    ctx = get_runtime_context()
    if ctx is None or ctx.space_id is None:
        raise RuntimeError("DAO tools require an active Space session.")
    return ctx.space_id, ctx.user_id


async def _space_slug(conn, space_id: UUID) -> str | None:
    row = await conn.fetchrow("SELECT slug FROM spaces WHERE id = $1", space_id)
    return row["slug"] if row else None


async def _publish_navigate(space_id: UUID, payload: dict[str, Any]) -> None:
    from DAO.comms import events as event_bus

    await event_bus.publish(space_id, "ui.navigate", payload)


def DAO_navigate(
    screen: str,
    hitl_id: str | None = None,
    drive_path: str | None = None,
) -> str:
    """Open a DAO company screen for the human (also emits ui.navigate SSE)."""
    screen_norm = (screen or "").strip().lower()
    if screen_norm not in _VALID_SCREENS:
        return tool_error(
            f"Unknown screen {screen!r}. "
            f"Use one of: {', '.join(sorted(_VALID_SCREENS))}."
        )

    try:
        space_id, _user_id = _require_space()
    except RuntimeError as exc:
        return tool_error(str(exc))

    from DAO.db import rls_connection, run_sync

    async def _run() -> dict[str, Any]:
        async with rls_connection(space_id=space_id) as conn:
            slug = await _space_slug(conn, space_id)
        payload: dict[str, Any] = {"screen": screen_norm}
        if hitl_id:
            payload["hitl_id"] = hitl_id.strip()
        if drive_path:
            payload["drive_path"] = drive_path.strip()
        if slug:
            if screen_norm in ("wiki", "reports", "drive", "brain", "memory"):
                view_map = {
                    "wiki": "wiki",
                    "reports": "reports",
                    "drive": "drive",
                    "brain": "truths",
                    "memory": "search",
                }
                view = view_map[screen_norm]
                href = f"/space/{slug}/memory?view={view}"
                if screen_norm == "drive" and drive_path:
                    from urllib.parse import quote

                    href += f"&path={quote(drive_path.strip())}"
                payload["href"] = href
            elif screen_norm == "command":
                payload["href"] = f"/space/{slug}/work?view=operations"
            elif screen_norm == "org":
                payload["href"] = f"/space/{slug}/control?section=organization"
            elif screen_norm == "chat":
                payload["href"] = "/"
            else:
                segment = "" if screen_norm in ("home", "") else f"/{screen_norm}"
                payload["href"] = f"/space/{slug}{segment}"
        await _publish_navigate(space_id, payload)
        return {"ok": True, "navigate": payload}

    try:
        result = run_sync(_run())
    except Exception as exc:
        logger.exception("DAO_navigate failed")
        return tool_error(f"Navigation failed: {exc}")

    return json.dumps(result, ensure_ascii=False)


def DAO_reports(limit: int = 20) -> str:
    """List recent Jarvis briefings and Drive writeback artifacts for this Space."""
    try:
        space_id, user_id = _require_space()
    except RuntimeError as exc:
        return tool_error(str(exc))

    from DAO.db import rls_connection, run_sync
    from DAO.jarvis import briefing as briefing_svc

    lim = max(1, min(int(limit or 20), 50))

    async def _run() -> dict[str, Any]:
        async with rls_connection(space_id=space_id, user_id=user_id) as conn:
            bundle = await briefing_svc.fetch_reports_bundle(conn, space_id, limit=lim)
            slug = await _space_slug(conn, space_id)
        if slug:
            bundle["links"] = {
                "reports": f"/space/{slug}/reports",
                "inbox": f"/space/{slug}/inbox",
                "home": f"/space/{slug}",
            }
        return bundle

    try:
        result = run_sync(_run())
    except Exception as exc:
        logger.exception("DAO_reports failed")
        return tool_error(f"Could not load reports: {exc}")

    return json.dumps(result, ensure_ascii=False, default=str)


def DAO_store_knowledge(
    title: str,
    content: str,
    slug: str | None = None,
    confidence: float = 0.7,
    department: str = "research",
) -> str:
    """Persist important compiled knowledge to Drive and the Company Brain."""
    title = (title or "").strip()
    content = (content or "").strip()
    if not title:
        return tool_error("title is required")
    if len(content) < 40:
        return tool_error("content is too short — only store substantive findings")

    try:
        space_id, user_id = _require_space()
    except RuntimeError as exc:
        return tool_error(str(exc))

    from DAO.brain.service import slugify_title
    from DAO.db import rls_connection, run_sync
    from DAO.drive.store import store_text_object

    entity_slug = slugify_title(slug or title)
    path = f"/knowledge/{entity_slug}/compiled.md"
    body = f"# {title}\n\n{content}"

    async def _run() -> dict[str, Any]:
        async with rls_connection(space_id=space_id, user_id=user_id) as conn:
            oid = await store_text_object(
                conn,
                space_id,
                path,
                body,
                produced_by_dept=(department or "research").strip() or "research",
                brain_title=title,
                brain_confidence=float(confidence or 0.7),
            )
        return {
            "ok": True,
            "slug": entity_slug,
            "path": path,
            "object_id": str(oid),
            "brain_entity": entity_slug,
        }

    try:
        result = run_sync(_run())
    except Exception as exc:
        logger.exception("DAO_store_knowledge failed")
        return tool_error(f"Could not store knowledge: {exc}")

    return json.dumps(result, ensure_ascii=False)


def DAO_wiki_read(path: str) -> str:
    """Read a company wiki page from Drive ``/wiki/`` (relative path, e.g. ``index`` or ``entities/acme``)."""
    rel = (path or "").strip().lstrip("/")
    if not rel or ".." in rel.split("/"):
        return tool_error("path must be a relative wiki path (no ..)")

    try:
        space_id, user_id = _require_space()
    except RuntimeError as exc:
        return tool_error(str(exc))

    from DAO.db import rls_connection, run_sync
    from DAO.wiki import service as wiki_svc

    async def _run() -> dict[str, Any]:
        async with rls_connection(space_id=space_id, user_id=user_id) as conn:
            await wiki_svc.ensure_wiki_initialized(conn, space_id)
            full = wiki_svc.wiki_path(rel)
            content = await wiki_svc.read_wiki_file(conn, space_id, full)
            if content is None:
                raise KeyError(rel)
            return {"ok": True, "path": full, "content": content}

    try:
        result = run_sync(_run())
    except KeyError:
        return tool_error(f"Wiki page not found: {rel}")
    except Exception as exc:
        logger.exception("DAO_wiki_read failed")
        return tool_error(f"Could not read wiki page: {exc}")

    return json.dumps(result, ensure_ascii=False)


def DAO_wiki_write(
    path: str,
    content: str,
    department: str = "research",
) -> str:
    """Write or update a company wiki markdown file under Drive ``/wiki/``."""
    rel = (path or "").strip().lstrip("/")
    body = (content or "").strip()
    if not rel or ".." in rel.split("/"):
        return tool_error("path must be a relative wiki path (e.g. entities/acme-corp.md)")
    if len(body) < 8:
        return tool_error("content is too short")

    try:
        space_id, user_id = _require_space()
    except RuntimeError as exc:
        return tool_error(str(exc))

    from DAO.db import rls_connection, run_sync
    from DAO.drive.store import store_text_object
    from DAO.wiki import service as wiki_svc

    full_path = wiki_svc.wiki_path(rel)

    async def _run() -> dict[str, Any]:
        async with rls_connection(space_id=space_id, user_id=user_id) as conn:
            oid = await store_text_object(
                conn,
                space_id,
                full_path,
                body,
                produced_by_dept=(department or "research").strip() or "research",
            )
        return {"ok": True, "path": full_path, "object_id": str(oid)}

    try:
        result = run_sync(_run())
    except Exception as exc:
        logger.exception("DAO_wiki_write failed")
        return tool_error(f"Could not write wiki page: {exc}")

    return json.dumps(result, ensure_ascii=False)


def DAO_pulse(refresh_briefing: bool = False) -> str:
    """Return company pulse (HITL, handoffs, Drive) and optionally refresh the briefing."""
    try:
        space_id, user_id = _require_space()
    except RuntimeError as exc:
        return tool_error(str(exc))

    from DAO.db import rls_connection, run_sync
    from DAO.jarvis import briefing as briefing_svc

    async def _run() -> dict[str, Any]:
        async with rls_connection(space_id=space_id, user_id=user_id) as conn:
            pulse = await briefing_svc.fetch_space_pulse(conn, space_id)
            pending = await conn.fetch(
                """
                SELECT id, action_summary, created_at
                FROM hitl_requests
                WHERE space_id = $1 AND status = 'pending'
                ORDER BY created_at DESC
                LIMIT 10
                """,
                space_id,
            )
            briefing = None
            if refresh_briefing:
                briefing = await briefing_svc.generate_and_store_briefing(
                    conn, space_id, trigger_source="agent"
                )
            else:
                briefing = await briefing_svc.fetch_latest_briefing(conn, space_id)
            slug = await _space_slug(conn, space_id)
        out: dict[str, Any] = {
            "pulse": pulse,
            "pending_hitl": [
                {
                    "id": str(r["id"]),
                    "action_summary": r["action_summary"],
                    "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                }
                for r in pending
            ],
            "latest_briefing": briefing,
        }
        if slug:
            out["links"] = {
                "inbox": f"/space/{slug}/inbox",
                "reports": f"/space/{slug}/reports",
                "chat": "/",
            }
        return out

    try:
        result = run_sync(_run())
    except Exception as exc:
        logger.exception("DAO_pulse failed")
        return tool_error(f"Could not load company pulse: {exc}")

    return json.dumps(result, ensure_ascii=False, default=str)


DAO_NAVIGATE_SCHEMA = {
    "name": "DAO_navigate",
    "description": (
        "Open a DAO company screen for the human (Home, Inbox, Drive, Command, Org, "
        "Brain, Wiki, Reports, Settings, or Chat). Wiki and Reports open Brain with "
        "the matching tab. Emits ui.navigate so the shell follows. Use when the user "
        "asks to see approvals, knowledge, or a company area."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "screen": {
                "type": "string",
                "enum": sorted(_VALID_SCREENS),
                "description": "Company screen to open.",
            },
            "hitl_id": {
                "type": "string",
                "description": "Optional HITL request UUID when opening inbox.",
            },
            "drive_path": {
                "type": "string",
                "description": "Optional Drive path hint when opening drive.",
            },
        },
        "required": ["screen"],
    },
}

DAO_REPORTS_SCHEMA = {
    "name": "DAO_reports",
    "description": (
        "List recent Jarvis morning briefings and Drive /writeback/ artifacts "
        "for the active Space. Use before summarizing report history for the user."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "limit": {
                "type": "integer",
                "description": "Max items per list (default 20, max 50).",
                "minimum": 1,
                "maximum": 50,
            },
        },
    },
}

DAO_STORE_KNOWLEDGE_SCHEMA = {
    "name": "DAO_store_knowledge",
    "description": (
        "Store durable company knowledge the team should reuse: writes "
        "/knowledge/{slug}/compiled.md on Drive and upserts a Brain entity. "
        "Call only for substantive findings (competitors, decisions, metrics) — "
        "not routine tool output or chat summaries."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Human-readable entity title.",
            },
            "content": {
                "type": "string",
                "description": "Compiled truth in markdown (facts, sources, implications).",
            },
            "slug": {
                "type": "string",
                "description": "Optional URL slug; derived from title when omitted.",
            },
            "confidence": {
                "type": "number",
                "description": "0–1 confidence in this truth (default 0.7).",
                "minimum": 0,
                "maximum": 1,
            },
            "department": {
                "type": "string",
                "description": "Owning department for Drive lineage (default research).",
            },
        },
        "required": ["title", "content"],
    },
}

DAO_PULSE_SCHEMA = {
    "name": "DAO_pulse",
    "description": (
        "Read company pulse for the active Space: pending HITL, handoffs, Drive "
        "activity, and latest briefing. Prefer this over terminal/filesystem search "
        "or hermes CLI. Set refresh_briefing=true to regenerate the morning briefing."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "refresh_briefing": {
                "type": "boolean",
                "description": "When true, generate and store a fresh briefing.",
            },
        },
    },
}

registry.register(
    name="DAO_navigate",
    toolset="DAO",
    schema=DAO_NAVIGATE_SCHEMA,
    handler=lambda args, **kw: DAO_navigate(
        screen=args.get("screen", ""),
        hitl_id=args.get("hitl_id"),
        drive_path=args.get("drive_path"),
    ),
    check_fn=_check_DAO_mode,
)

registry.register(
    name="DAO_reports",
    toolset="DAO",
    schema=DAO_REPORTS_SCHEMA,
    handler=lambda args, **kw: DAO_reports(limit=args.get("limit", 20)),
    check_fn=_check_DAO_mode,
)

registry.register(
    name="DAO_pulse",
    toolset="DAO",
    schema=DAO_PULSE_SCHEMA,
    handler=lambda args, **kw: DAO_pulse(
        refresh_briefing=bool(args.get("refresh_briefing")),
    ),
    check_fn=_check_DAO_mode,
)

registry.register(
    name="DAO_store_knowledge",
    toolset="DAO",
    schema=DAO_STORE_KNOWLEDGE_SCHEMA,
    handler=lambda args, **kw: DAO_store_knowledge(
        title=args.get("title", ""),
        content=args.get("content", ""),
        slug=args.get("slug"),
        confidence=float(args.get("confidence", 0.7) or 0.7),
        department=args.get("department", "research"),
    ),
    check_fn=_check_DAO_mode,
)

DAO_WIKI_READ_SCHEMA = {
    "name": "DAO_wiki_read",
    "description": (
        "Read a page from the Space company wiki on Drive (/wiki/). "
        "Use for orientation: SCHEMA.md, index.md, log.md, or any entity/concept page."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "Relative path without /wiki/ prefix (e.g. index, entities/acme-corp).",
            },
        },
        "required": ["path"],
    },
}

DAO_WIKI_WRITE_SCHEMA = {
    "name": "DAO_wiki_write",
    "description": (
        "Write markdown to the Space company wiki on Drive (/wiki/). "
        "Parent folders are created lazily. Use for entities, concepts, raw notes, "
        "index.md updates, and log.md append entries — not for compiled Brain truths "
        "(use DAO_store_knowledge for those)."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "Relative path (e.g. entities/acme-corp.md, log.md).",
            },
            "content": {
                "type": "string",
                "description": "Full markdown file content.",
            },
            "department": {
                "type": "string",
                "description": "Owning department for Drive lineage (default research).",
            },
        },
        "required": ["path", "content"],
    },
}

registry.register(
    name="DAO_wiki_read",
    toolset="DAO",
    schema=DAO_WIKI_READ_SCHEMA,
    handler=lambda args, **kw: DAO_wiki_read(path=args.get("path", "")),
    check_fn=_check_DAO_mode,
)

registry.register(
    name="DAO_wiki_write",
    toolset="DAO",
    schema=DAO_WIKI_WRITE_SCHEMA,
    handler=lambda args, **kw: DAO_wiki_write(
        path=args.get("path", ""),
        content=args.get("content", ""),
        department=args.get("department", "research"),
    ),
    check_fn=_check_DAO_mode,
)
