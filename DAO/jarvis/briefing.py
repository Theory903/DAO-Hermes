"""Morning briefing generation and persistence."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any
from uuid import UUID

if TYPE_CHECKING:
    import asyncpg

_log = logging.getLogger(__name__)

_JSON_FENCE = re.compile(r"```(?:json)?\s*(.+?)```", re.DOTALL | re.IGNORECASE)


@dataclass(frozen=True)
class BriefingContext:
    pulse: dict[str, int]
    hitl_pending: list[dict[str, Any]]
    handoffs_24h: list[dict[str, Any]]
    drive_recent: list[dict[str, Any]]
    writebacks: list[dict[str, Any]]


async def list_briefings(
    conn: asyncpg.Connection,
    space_id: UUID,
    *,
    limit: int = 30,
) -> list[dict]:
    rows = await conn.fetch(
        """
        SELECT markdown, generated_at, trigger_source
        FROM jarvis_briefings
        WHERE space_id = $1
        ORDER BY generated_at DESC
        LIMIT $2
        """,
        space_id,
        max(1, min(limit, 100)),
    )
    return [
        {
            "kind": "briefing",
            "markdown": row["markdown"],
            "generated_at": row["generated_at"].isoformat(),
            "trigger_source": row["trigger_source"],
        }
        for row in rows
    ]


async def list_writeback_artifacts(
    conn: asyncpg.Connection,
    space_id: UUID,
    *,
    limit: int = 30,
) -> list[dict]:
    rows = await conn.fetch(
        """
        SELECT id, path, produced_by_dept, created_at
        FROM drive_objects
        WHERE space_id = $1 AND path LIKE '/writeback/%'
        ORDER BY created_at DESC
        LIMIT $2
        """,
        space_id,
        max(1, min(limit, 100)),
    )
    return [
        {
            "kind": "writeback",
            "object_id": str(row["id"]),
            "path": row["path"],
            "produced_by_dept": row["produced_by_dept"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        }
        for row in rows
    ]


async def fetch_reports_bundle(
    conn: asyncpg.Connection,
    space_id: UUID,
    *,
    limit: int = 30,
) -> dict:
    briefings = await list_briefings(conn, space_id, limit=limit)
    writebacks = await list_writeback_artifacts(conn, space_id, limit=limit)
    pulse = await fetch_space_pulse(conn, space_id)
    return {
        "pulse": pulse,
        "briefings": briefings,
        "writebacks": writebacks,
    }


async def fetch_latest_briefing(conn: asyncpg.Connection, space_id: UUID) -> dict | None:
    row = await conn.fetchrow(
        """
        SELECT markdown, generated_at, trigger_source
        FROM jarvis_briefings
        WHERE space_id = $1
        ORDER BY generated_at DESC
        LIMIT 1
        """,
        space_id,
    )
    if not row:
        return None
    return {
        "markdown": row["markdown"],
        "generated_at": row["generated_at"].isoformat(),
        "trigger_source": row["trigger_source"],
    }


async def fetch_space_pulse(conn: asyncpg.Connection, space_id: UUID) -> dict[str, int]:
    pending_hitl = await conn.fetchval(
        "SELECT count(*) FROM hitl_requests WHERE space_id = $1 AND status = 'pending'",
        space_id,
    )
    recent_handoffs = await conn.fetchval(
        """
        SELECT count(*) FROM interdept_messages
        WHERE space_id = $1 AND created_at > now() - interval '24 hours'
        """,
        space_id,
    )
    drive_recent = await conn.fetchval(
        """
        SELECT count(*) FROM drive_objects
        WHERE space_id = $1 AND created_at > now() - interval '24 hours'
        """,
        space_id,
    )
    brain_count = await conn.fetchval(
        "SELECT count(*) FROM brain_entities WHERE space_id = $1",
        space_id,
    )
    return {
        "pending_hitl": int(pending_hitl or 0),
        "handoffs_24h": int(recent_handoffs or 0),
        "drive_artifacts_24h": int(drive_recent or 0),
        "brain_entities": int(brain_count or 0),
    }


async def fetch_briefing_context(conn: asyncpg.Connection, space_id: UUID) -> BriefingContext:
    pulse = await fetch_space_pulse(conn, space_id)
    hitl_rows = await conn.fetch(
        """
        SELECT action_summary, created_at
        FROM hitl_requests
        WHERE space_id = $1 AND status = 'pending'
        ORDER BY created_at ASC
        LIMIT 5
        """,
        space_id,
    )
    handoff_rows = await conn.fetch(
        """
        SELECT from_dept, to_dept, subject, msg_type, created_at
        FROM interdept_messages
        WHERE space_id = $1 AND created_at > now() - interval '24 hours'
        ORDER BY created_at DESC
        LIMIT 5
        """,
        space_id,
    )
    drive_rows = await conn.fetch(
        """
        SELECT path, produced_by_dept, created_at
        FROM drive_objects
        WHERE space_id = $1
          AND created_at > now() - interval '24 hours'
          AND path NOT LIKE '/writeback/%'
        ORDER BY created_at DESC
        LIMIT 6
        """,
        space_id,
    )
    writebacks = await list_writeback_artifacts(conn, space_id, limit=4)
    return BriefingContext(
        pulse=pulse,
        hitl_pending=[
            {
                "action_summary": row["action_summary"],
                "created_at": row["created_at"],
            }
            for row in hitl_rows
        ],
        handoffs_24h=[
            {
                "from_dept": row["from_dept"],
                "to_dept": row["to_dept"],
                "subject": (row["subject"] or "").strip(),
                "msg_type": row["msg_type"],
                "created_at": row["created_at"],
            }
            for row in handoff_rows
        ],
        drive_recent=[
            {
                "path": row["path"],
                "produced_by_dept": row["produced_by_dept"],
                "created_at": row["created_at"],
            }
            for row in drive_rows
        ],
        writebacks=writebacks,
    )


def _format_dept(dept: str | None) -> str:
    raw = (dept or "general").replace("_", " ").strip()
    return raw.title() if raw else "General"


def _short_path(path: str) -> str:
    parts = [p for p in path.strip("/").split("/") if p]
    if not parts:
        return path or "(untitled)"
    if len(parts) <= 2:
        return parts[-1]
    return "/".join(parts[-2:])


def _truncate(text: str, limit: int = 100) -> str:
    raw = " ".join((text or "").split())
    if len(raw) <= limit:
        return raw
    return raw[: limit - 3].rstrip() + "..."


def briefing_headline(ctx: BriefingContext) -> str:
    pending = ctx.pulse["pending_hitl"]
    if pending > 0:
        oldest = ctx.hitl_pending[0]["action_summary"] if ctx.hitl_pending else ""
        detail = f" Oldest: *{_truncate(oldest, 80)}*." if oldest else ""
        noun = "approval" if pending == 1 else "approvals"
        return (
            f"**{pending} {noun} blocking the team** — clear Inbox before you delegate.{detail}"
        )
    if ctx.handoffs_24h:
        h = ctx.handoffs_24h[0]
        subject = _truncate(h.get("subject") or h.get("msg_type") or "handoff", 60)
        return (
            f"**{_format_dept(h['from_dept'])} → {_format_dept(h['to_dept'])}** "
            f"handed off overnight: *{subject}*."
        )
    if ctx.pulse["drive_artifacts_24h"] > 0:
        n = ctx.pulse["drive_artifacts_24h"]
        noun = "artifact" if n == 1 else "artifacts"
        return f"**{n} new {noun} landed in Drive** — reuse before rerunning research."
    if ctx.writebacks:
        return "**Reuse wins are ready** — yesterday's work can skip duplicate tool runs today."
    return "**Clear runway** — pick one outcome in Chat and let departments execute."


def prioritized_actions(ctx: BriefingContext, lead: str) -> list[str]:
    actions: list[str] = []
    for item in ctx.hitl_pending[:2]:
        summary = _truncate(item["action_summary"], 90)
        actions.append(f"Approve or reject in Inbox: *{summary}*")
    for h in ctx.handoffs_24h[:2]:
        subject = _truncate(h.get("subject") or h.get("msg_type") or "handoff", 70)
        actions.append(
            f"Follow the {_format_dept(h['from_dept'])} → {_format_dept(h['to_dept'])} "
            f"handoff: *{subject}*"
        )
    if ctx.writebacks and len(actions) < 3:
        wb = ctx.writebacks[0]
        actions.append(
            f"Reuse writeback from {_format_dept(wb.get('produced_by_dept'))}: "
            f"`{_short_path(wb['path'])}`"
        )
    if ctx.drive_recent and len(actions) < 3:
        d = ctx.drive_recent[0]
        actions.append(
            f"Review new Drive output ({_format_dept(d.get('produced_by_dept'))}): "
            f"`{_short_path(d['path'])}`"
        )
    if len(actions) < 3:
        actions.append(f"Tell **{lead}** today's single priority in Chat — one sentence.")
    if len(actions) < 3 and ctx.pulse["brain_entities"] > 0:
        actions.append("Check Brain for compiled truths before assigning net-new research.")
    deduped: list[str] = []
    for action in actions:
        if action not in deduped:
            deduped.append(action)
        if len(deduped) >= 3:
            break
    return deduped


def _render_needs_you_now(ctx: BriefingContext) -> str:
    if not ctx.hitl_pending:
        return "_Nothing blocking — you're clear to delegate._\n"
    lines = []
    for item in ctx.hitl_pending:
        lines.append(f"- {_truncate(item['action_summary'], 120)}")
    return "\n".join(lines) + "\n"


def _render_overnight(ctx: BriefingContext) -> str:
    parts: list[str] = []
    if ctx.handoffs_24h:
        parts.append("### Handoffs\n")
        for h in ctx.handoffs_24h:
            subject = _truncate(h.get("subject") or h.get("msg_type") or "handoff", 80)
            parts.append(
                f"- **{_format_dept(h['from_dept'])} → {_format_dept(h['to_dept'])}** — {subject}"
            )
        parts.append("")
    if ctx.drive_recent:
        parts.append("### New in Drive (24h)\n")
        for d in ctx.drive_recent:
            dept = _format_dept(d.get("produced_by_dept"))
            parts.append(f"- `{_short_path(d['path'])}` · {dept}")
        parts.append("")
    if not parts:
        return "_Quiet overnight — no handoffs or new Drive artifacts in the last 24 hours._\n"
    return "\n".join(parts)


def _render_reuse_wins(ctx: BriefingContext) -> str:
    if not ctx.writebacks:
        return "_No writebacks yet — first wins will show here for one-click reuse._\n"
    lines = []
    for wb in ctx.writebacks:
        dept = _format_dept(wb.get("produced_by_dept"))
        lines.append(f"- `{_short_path(wb['path'])}` · {dept}")
    return "\n".join(lines) + "\n"


def render_briefing_markdown(
    *,
    space_name: str,
    lead: str,
    mission: str,
    stamp: str,
    ctx: BriefingContext,
    opener: str | None = None,
) -> str:
    headline = opener or briefing_headline(ctx)
    mission_block = f"\n> {mission}\n" if mission else ""
    actions = prioritized_actions(ctx, lead)
    action_lines = "\n".join(f"{i}. {line}" for i, line in enumerate(actions, start=1))
    pulse = ctx.pulse

    return f"""# Morning Briefing — {space_name}

*{stamp}* · Prepared by **{lead}**

{headline}
{mission_block}
## Needs you now

{_render_needs_you_now(ctx)}
## Overnight pulse

{_render_overnight(ctx)}
## Scoreboard

| Signal | Count |
|--------|------:|
| HITL pending | {pulse["pending_hitl"]} |
| Handoffs (24h) | {pulse["handoffs_24h"]} |
| Drive artifacts (24h) | {pulse["drive_artifacts_24h"]} |
| Brain entities | {pulse["brain_entities"]} |

## Do these three first

{action_lines}

## Reuse wins

{_render_reuse_wins(ctx)}
---
*Refresh anytime from Home, or ask {lead} to run `DAO_pulse(refresh_briefing=true)`.*
"""


def _parse_opener_json(text: str) -> str | None:
    raw = (text or "").strip()
    if not raw:
        return None
    match = _JSON_FENCE.search(raw)
    if match:
        raw = match.group(1).strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if isinstance(data, dict):
        opener = str(data.get("opener") or data.get("headline") or "").strip()
    else:
        opener = str(data).strip()
    if not opener:
        return None
    if len(opener) > 320:
        opener = opener[:317].rstrip() + "..."
    if not opener.startswith("**"):
        opener = f"**{opener.rstrip('.')}**"
    return opener


def _generate_briefing_opener_sync(
    *,
    space_name: str,
    lead: str,
    ctx: BriefingContext,
    fallback: str,
) -> str:
    from agent.auxiliary_client import call_llm

    hitl = [_truncate(x["action_summary"], 60) for x in ctx.hitl_pending[:3]]
    handoffs = [
        f"{_format_dept(h['from_dept'])}→{_format_dept(h['to_dept'])}: "
        f"{_truncate(h.get('subject') or '', 40)}"
        for h in ctx.handoffs_24h[:3]
    ]
    drive = [_short_path(d["path"]) for d in ctx.drive_recent[:3]]
    user = f"""Space: {space_name}
AI Lead: {lead}
Pending HITL ({ctx.pulse['pending_hitl']}): {hitl or ['none']}
Handoffs 24h ({ctx.pulse['handoffs_24h']}): {handoffs or ['none']}
Drive 24h ({ctx.pulse['drive_artifacts_24h']}): {drive or ['none']}
Brain entities: {ctx.pulse['brain_entities']}

Write one punchy briefing opener for the human operator (max 220 chars).
Be specific — name the blocker or opportunity. No markdown lists. Bold the key phrase with **.
Sound like a sharp chief of staff, not a status dashboard.

Return JSON: {{"opener": "**...**"}}"""

    try:
        response = call_llm(
            task="title_generation",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You write executive morning brief openers for an AI company OS. "
                        "Return JSON only."
                    ),
                },
                {"role": "user", "content": user},
            ],
            temperature=0.65,
            max_tokens=120,
        )
        text = (response.choices[0].message.content or "").strip()
        parsed = _parse_opener_json(text)
        if parsed:
            return parsed
    except Exception:
        _log.debug("AI briefing opener failed", exc_info=True)
    return fallback


async def generate_briefing_markdown(
    conn: asyncpg.Connection,
    space_id: UUID,
    *,
    trigger_source: str = "api",
    use_llm: bool | None = None,
) -> tuple[str, datetime]:
    row = await conn.fetchrow(
        "SELECT name, ai_lead_config FROM spaces WHERE id = $1",
        space_id,
    )
    if not row:
        raise ValueError("Space not found")

    cfg = row["ai_lead_config"]
    if isinstance(cfg, str):
        cfg = json.loads(cfg)
    lead = cfg.get("name", "Jarvis")
    mission = (cfg.get("mission") or "").strip()

    ctx = await fetch_briefing_context(conn, space_id)
    now = datetime.now(timezone.utc)
    stamp = now.strftime("%A, %B %d").replace(" 0", " ")
    fallback_headline = briefing_headline(ctx)

    opener: str | None = None
    if use_llm is None:
        use_llm = trigger_source in ("api", "agent")
    if use_llm:
        opener = await asyncio.to_thread(
            _generate_briefing_opener_sync,
            space_name=row["name"],
            lead=lead,
            ctx=ctx,
            fallback=fallback_headline,
        )

    md = render_briefing_markdown(
        space_name=row["name"],
        lead=lead,
        mission=mission,
        stamp=stamp,
        ctx=ctx,
        opener=opener,
    )
    return md, now


async def persist_briefing(
    conn: asyncpg.Connection,
    space_id: UUID,
    markdown: str,
    generated_at: datetime,
    *,
    trigger_source: str = "api",
) -> dict:
    await conn.execute(
        """
        INSERT INTO jarvis_briefings (space_id, markdown, generated_at, trigger_source)
        VALUES ($1, $2, $3, $4)
        """,
        space_id,
        markdown,
        generated_at,
        trigger_source,
    )
    return {
        "markdown": markdown,
        "generated_at": generated_at.isoformat(),
        "trigger_source": trigger_source,
    }


async def generate_and_store_briefing(
    conn: asyncpg.Connection,
    space_id: UUID,
    *,
    trigger_source: str = "api",
    use_llm: bool | None = None,
) -> dict:
    markdown, generated_at = await generate_briefing_markdown(
        conn,
        space_id,
        trigger_source=trigger_source,
        use_llm=use_llm,
    )
    result = await persist_briefing(
        conn,
        space_id,
        markdown,
        generated_at,
        trigger_source=trigger_source,
    )
    try:
        from DAO.jarvis.home import record_home_snapshot

        await record_home_snapshot(conn, space_id)
    except Exception:
        _log.debug("Home score snapshot skipped", exc_info=True)
    return result
