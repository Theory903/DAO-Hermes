"""Home 6.0 bundle — Company OS control loop for desktop Home."""

from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any
from uuid import UUID

if TYPE_CHECKING:
    import asyncpg

from DAO.jarvis import briefing as briefing_svc
from DAO.jarvis.briefing import BriefingContext, prioritized_actions

_MODE_FOCUS = {
    "growth": "Customer acquisition",
    "execution": "Shipping commitments",
    "learning": "Compounding knowledge",
    "recovery": "Clear blockers",
}

_ARCHETYPE_BY_MODE = {
    "growth": "Explorer",
    "execution": "Operator",
    "learning": "Builder",
    "recovery": "Operator",
}

_DEFAULT_NORTH_STAR = "90% Autonomous Operations"


def _truncate(text: str, limit: int = 100) -> str:
    raw = " ".join((text or "").split())
    if len(raw) <= limit:
        return raw
    return raw[: limit - 3].rstrip() + "..."


def _short_path(path: str) -> str:
    parts = [p for p in (path or "").strip("/").split("/") if p]
    if not parts:
        return path or "(untitled)"
    if len(parts) <= 2:
        return parts[-1]
    return "/".join(parts[-2:])


def derive_stage(created_at: datetime | None, pulse: dict[str, int]) -> str:
    if created_at is None:
        return "Early Growth"
    now = datetime.now(timezone.utc)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    age_days = (now - created_at).days
    activity = (
        pulse.get("drive_artifacts_24h", 0)
        + pulse.get("handoffs_24h", 0)
        + pulse.get("brain_entities", 0)
    )
    if age_days < 7:
        return "Launch"
    if age_days < 30 or activity < 5:
        return "Early Growth"
    if age_days < 90:
        return "Growth"
    return "Scaling"


def derive_archetype(mode_key: str, persona: str | None = None) -> str:
    persona_l = (persona or "").lower()
    if "creator" in persona_l:
        return "Creator"
    if "leader" in persona_l or "market" in persona_l:
        return "Market Leader"
    return _ARCHETYPE_BY_MODE.get(mode_key, "Builder")


def derive_operating_mode(pulse: dict[str, int], *, writebacks_7d: int = 0) -> dict[str, Any]:
    pending = pulse.get("pending_hitl", 0)
    handoffs = pulse.get("handoffs_24h", 0)
    drive = pulse.get("drive_artifacts_24h", 0)
    brain = pulse.get("brain_entities", 0)

    if pending >= 3:
        mode = "recovery"
        confidence = 0.75
    elif drive == 0 and handoffs == 0 and brain == 0 and pending == 0:
        mode = "recovery"
        confidence = 0.6
    elif pending >= 1 or handoffs >= 2:
        mode = "execution"
        confidence = 0.8
    elif writebacks_7d >= 2 or brain >= 5:
        mode = "learning"
        confidence = 0.7
    elif drive >= 2 and pending == 0:
        mode = "growth"
        confidence = 0.75
    else:
        mode = "learning"
        confidence = 0.5

    return {
        "mode": mode,
        "focus_label": _MODE_FOCUS[mode],
        "confidence": confidence,
    }


def compute_rings(pulse: dict[str, int], metrics: dict[str, int]) -> dict[str, float]:
    growth = min(1.0, pulse.get("drive_artifacts_24h", 0) / 5.0)
    execution = min(
        1.0,
        (metrics.get("writebacks_7d", 0) + pulse.get("handoffs_24h", 0)) / 6.0,
    )
    learning = min(1.0, pulse.get("brain_entities", 0) / 10.0)
    resolved = metrics.get("hitl_resolved_7d", 0)
    pending = pulse.get("pending_hitl", 0)
    autonomy = resolved / max(1, resolved + pending)
    return {
        "growth": round(growth, 2),
        "execution": round(execution, 2),
        "learning": round(learning, 2),
        "autonomy": round(autonomy, 2),
    }


def compute_score(rings: dict[str, float]) -> int:
    avg = sum(rings.values()) / max(1, len(rings))
    return int(round(avg * 100))


def derive_operating_state(
    pulse: dict[str, int],
    *,
    score_delta: int | None,
    mode_key: str,
) -> dict[str, Any]:
    pending = pulse.get("pending_hitl", 0)
    if pending >= 3:
        return {
            "label": "Execution bottleneck",
            "tone": "warning",
            "subline": "Approvals are stacking up",
        }
    if pending >= 1:
        return {
            "label": "Needs attention",
            "tone": "warning",
            "subline": "One decision is waiting",
        }
    if score_delta is not None and score_delta >= 5:
        return {
            "label": "Growing",
            "tone": "positive",
            "subline": "Momentum is up this week",
        }
    if mode_key == "growth":
        return {
            "label": "Healthy",
            "tone": "positive",
            "subline": "Autonomy increasing",
        }
    if mode_key == "learning":
        return {"label": "Learning", "tone": "positive"}
    if mode_key == "recovery":
        return {
            "label": "Steady",
            "tone": "neutral",
            "subline": "Clear the runway to accelerate",
        }
    return {"label": "Steady", "tone": "neutral"}


def why_this_matters_for_hitl(summary: str, pulse: dict[str, int]) -> str:
    lower = (summary or "").lower()
    if "price" in lower or "pricing" in lower:
        return "Customers are less price-sensitive than expected."
    if pulse.get("pending_hitl", 0) > 1:
        return "Clearing this unblocks the next team actions in the queue."
    return "Your decision here sets direction the agents will execute autonomously."


def hitl_row_to_focus_card(row: dict[str, Any], pulse: dict[str, int]) -> dict[str, Any]:
    summary = str(row.get("action_summary") or "")
    tool_trace = row.get("tool_trace")
    if isinstance(tool_trace, str):
        try:
            tool_trace = json.loads(tool_trace)
        except json.JSONDecodeError:
            tool_trace = {}
    drive_refs = row.get("drive_refs") or []
    return {
        "id": str(row["id"]),
        "kind": "hitl",
        "title": _truncate(summary, 80),
        "context": summary,
        "recommendation": None,
        "why_this_matters": why_this_matters_for_hitl(summary, pulse),
        "impact": "high",
        "time_estimate": "2 min",
        "confidence": 0.85,
        "tool_trace": tool_trace if isinstance(tool_trace, dict) else {},
        "drive_refs": [str(ref) for ref in drive_refs],
    }


def recommend_to_focus_card(text: str, index: int) -> dict[str, Any]:
    clean = text.strip().strip("*")
    return {
        "id": f"recommend-{index}",
        "kind": "recommend",
        "title": _truncate(clean, 80),
        "context": clean,
        "recommendation": clean,
        "why_this_matters": "This is the highest-leverage next move after your inbox is clear.",
        "impact": "medium",
        "time_estimate": "5 min",
        "confidence": 0.6,
        "tool_trace": {},
        "drive_refs": [],
    }


def build_winning_signals(
    score: int,
    score_delta: int | None,
    pulse: dict[str, int],
    ctx: BriefingContext,
) -> list[str]:
    lines: list[str] = []
    if score_delta is not None and score_delta > 0:
        lines.append(f"You're accelerating — momentum up {score_delta} points this week.")
    elif score_delta is not None and score_delta < 0:
        lines.append(
            f"Momentum dipped {abs(score_delta)} points — focus on clearing blockers."
        )
    if pulse.get("pending_hitl", 0) == 0 and pulse.get("drive_artifacts_24h", 0) > 0:
        n = pulse["drive_artifacts_24h"]
        noun = "artifact" if n == 1 else "artifacts"
        lines.append(
            f"Team shipped {n} {noun} in the last day with no decisions waiting."
        )
    if ctx.writebacks:
        lines.append(
            "Reuse wins are stacking — yesterday's work can skip duplicate runs today."
        )
    if pulse.get("brain_entities", 0) > 0:
        lines.append(
            f"Brain holds {pulse['brain_entities']} compiled truths the team can lean on."
        )
    if not lines:
        lines.append("Clear runway — pick one outcome and let departments execute.")
    return lines[:3]


def build_changed_feed(ctx: BriefingContext, *, limit: int = 5) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    for h in ctx.handoffs_24h:
        subject = _truncate(h.get("subject") or h.get("msg_type") or "handoff", 90)
        cards.append(
            {
                "kind": "handoff",
                "title": f"{h.get('from_dept', 'team')} → {h.get('to_dept', 'team')}",
                "body": subject,
                "at": h.get("created_at").isoformat() if h.get("created_at") else None,
            }
        )
    for wb in ctx.writebacks:
        cards.append(
            {
                "kind": "writeback",
                "title": "New reuse win",
                "body": _short_path(str(wb.get("path") or "")),
                "at": wb.get("created_at"),
            }
        )
    for d in ctx.drive_recent:
        cards.append(
            {
                "kind": "drive",
                "title": "Drive output",
                "body": _short_path(str(d.get("path") or "")),
                "at": d.get("created_at").isoformat() if d.get("created_at") else None,
            }
        )
    return cards[:limit]


def _graph_event_card_title(event_type: str) -> str:
    labels = {
        "object_created": "New object",
        "object_updated": "Updated",
        "hitl_resolved": "Decision",
        "handoff_completed": "Handoff",
        "decision_reconsidered": "Decision reopened",
        "object_linked": "Linked",
        "object_merged": "Merged",
        "playbook_run": "Automation",
        "outcome_recorded": "Outcome",
    }
    return labels.get(event_type, event_type.replace("_", " ").title())


async def fetch_graph_changed_feed(
    conn: asyncpg.Connection,
    space_id: UUID,
    *,
    limit: int = 5,
    importance_gte: int = 6,
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT e.event_type, e.importance, e.created_at, e.object_id,
               o.title AS object_title, o.object_type
        FROM object_events e
        JOIN space_objects o ON o.id = e.object_id AND o.space_id = e.space_id
        WHERE e.space_id = $1
          AND e.importance >= $2
          AND o.merged_into_id IS NULL
        ORDER BY e.importance DESC, e.created_at DESC
        LIMIT $3
        """,
        space_id,
        importance_gte,
        limit,
    )
    cards: list[dict[str, Any]] = []
    for row in rows:
        cards.append(
            {
                "kind": row["object_type"],
                "title": _graph_event_card_title(row["event_type"]),
                "body": _truncate(str(row["object_title"]), 90),
                "at": row["created_at"].isoformat() if row["created_at"] else None,
                "object_id": str(row["object_id"]),
                "event_type": row["event_type"],
                "importance": int(row["importance"]),
            }
        )
    return cards


async def build_changed_feed_merged(
    conn: asyncpg.Connection,
    space_id: UUID,
    ctx: BriefingContext,
    *,
    limit: int = 5,
) -> list[dict[str, Any]]:
    try:
        graph_cards = await fetch_graph_changed_feed(conn, space_id, limit=limit)
        if graph_cards:
            return graph_cards
    except Exception:
        pass
    return build_changed_feed(ctx, limit=limit)


async def fetch_story_milestones(
    conn: asyncpg.Connection,
    space_id: UUID,
    *,
    limit: int = 5,
    importance_gte: int = 7,
) -> list[str]:
    rows = await conn.fetch(
        """
        SELECT e.event_type, o.title
        FROM object_events e
        JOIN space_objects o ON o.id = e.object_id AND o.space_id = e.space_id
        WHERE e.space_id = $1
          AND e.importance >= $2
          AND o.merged_into_id IS NULL
        ORDER BY e.created_at ASC
        LIMIT $3
        """,
        space_id,
        importance_gte,
        limit,
    )
    return [
        f"{_graph_event_card_title(row['event_type'])}: {_truncate(str(row['title']), 72)}"
        for row in rows
    ]


def parse_learned_insights(
    markdown: str | None,
    ctx: BriefingContext,
) -> list[dict[str, str]]:
    insights: list[dict[str, str]] = []
    if ctx.writebacks:
        wb = ctx.writebacks[0]
        insights.append(
            {
                "title": "Reuse is compounding",
                "body": f"Latest writeback: `{_short_path(wb.get('path', ''))}`",
            }
        )
    if ctx.pulse.get("brain_entities", 0) > 0:
        insights.append(
            {
                "title": "Brain is growing",
                "body": f"{ctx.pulse['brain_entities']} compiled truths ready for delegation.",
            }
        )
    if markdown:
        match = re.search(
            r"## Reuse wins\s*\n+([\s\S]*?)(?:\n## |\n---|\Z)",
            markdown,
            re.IGNORECASE,
        )
        if match:
            for line in match.group(1).splitlines():
                line = line.strip().lstrip("- ").strip()
                if line and not line.startswith("_"):
                    insights.append(
                        {
                            "title": "From today's briefing",
                            "body": line.replace("`", ""),
                        }
                    )
                    break
    if not insights:
        insights.append(
            {
                "title": "Getting started",
                "body": "First wins will show here as writebacks and Brain truths accumulate.",
            }
        )
    return insights[:3]


def build_recommends(
    ctx: BriefingContext,
    lead: str,
    *,
    exclude_summaries: set[str],
) -> list[dict[str, str]]:
    raw = prioritized_actions(ctx, lead)
    cards: list[dict[str, str]] = []
    for action in raw:
        plain = action.replace("*", "").strip()
        if any(ex in plain for ex in exclude_summaries if ex):
            continue
        if plain.lower().startswith("approve or reject"):
            continue
        cards.append({"title": _truncate(plain, 100), "body": plain})
        if len(cards) >= 3:
            break
    return cards


def build_story(
    *,
    space_name: str,
    mission: str,
    created_at: datetime | None,
    pulse: dict[str, int],
    automation_count: int,
) -> dict[str, Any]:
    started = (
        f"Started {space_name}"
        + (f" to {mission.rstrip('.')}" if mission else "")
        + "."
    )
    if pulse.get("brain_entities", 0) > 0:
        are = f"Compiling knowledge — {pulse['brain_entities']} truths in Brain."
    elif pulse.get("drive_artifacts_24h", 0) > 0:
        are = "Shipping artifacts daily across departments."
    else:
        are = "Setting up the operating system for autonomous work."
    going = (
        "Scaling autonomy — fewer repeat decisions, more compounding output."
        if pulse.get("pending_hitl", 0) == 0
        else "Clearing decisions so agents can run without waiting."
    )
    achievements: list[str] = []
    if pulse.get("brain_entities", 0) >= 1:
        achievements.append("First Brain truth compiled")
    if automation_count > 0:
        achievements.append(f"{automation_count} automations on the board")
    if pulse.get("drive_artifacts_24h", 0) >= 3:
        achievements.append("High output day in Drive")
    return {
        "started": started,
        "are": are,
        "going": going,
        "achievements": achievements[:5],
    }


async def build_story_merged(
    conn: asyncpg.Connection,
    space_id: UUID,
    *,
    space_name: str,
    mission: str,
    created_at: datetime | None,
    pulse: dict[str, int],
    automation_count: int,
) -> dict[str, Any]:
    story = build_story(
        space_name=space_name,
        mission=mission,
        created_at=created_at,
        pulse=pulse,
        automation_count=automation_count,
    )
    try:
        milestones = await fetch_story_milestones(conn, space_id)
        if milestones:
            merged = list(story["achievements"])
            for line in milestones:
                if line not in merged:
                    merged.append(line)
            story["achievements"] = merged[:8]
            story["milestones"] = milestones
    except Exception:
        pass
    return story


def week_start_for(dt: datetime | None = None) -> date:
    ref = dt or datetime.now(timezone.utc)
    if ref.tzinfo is None:
        ref = ref.replace(tzinfo=timezone.utc)
    d = ref.date()
    return d - timedelta(days=d.weekday())


def active_snoozed_ids(preferences: Any, *, now: datetime | None = None) -> set[str]:
    if isinstance(preferences, str):
        try:
            preferences = json.loads(preferences)
        except json.JSONDecodeError:
            preferences = {}
    if not isinstance(preferences, dict):
        return set()
    snooze = preferences.get("home_focus_snooze") or {}
    if not isinstance(snooze, dict):
        return set()
    ref = now or datetime.now(timezone.utc)
    active: set[str] = set()
    for rid, expiry in snooze.items():
        try:
            exp = datetime.fromisoformat(str(expiry).replace("Z", "+00:00"))
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp > ref:
                active.add(str(rid))
        except (TypeError, ValueError):
            continue
    return active


async def fetch_home_metrics(conn: asyncpg.Connection, space_id: UUID) -> dict[str, int]:
    writebacks_7d = await conn.fetchval(
        """
        SELECT count(*) FROM drive_objects
        WHERE space_id = $1
          AND path LIKE '/writeback/%'
          AND created_at > now() - interval '7 days'
        """,
        space_id,
    )
    hitl_resolved_7d = await conn.fetchval(
        """
        SELECT count(*) FROM hitl_requests
        WHERE space_id = $1
          AND status IN ('approved', 'rejected')
          AND resolved_at > now() - interval '7 days'
        """,
        space_id,
    )
    from DAO.jarvis.automations import load_automations_rls

    automations = await load_automations_rls(conn, space_id)
    return {
        "writebacks_7d": int(writebacks_7d or 0),
        "hitl_resolved_7d": int(hitl_resolved_7d or 0),
        "automation_count": len(automations),
    }


async def fetch_pending_hitl_rows(
    conn: asyncpg.Connection,
    space_id: UUID,
    *,
    snoozed_ids: set[str],
    limit: int = 5,
) -> list[asyncpg.Record]:
    rows = await conn.fetch(
        """
        SELECT id, action_summary, tool_trace, drive_refs, created_at
        FROM hitl_requests
        WHERE space_id = $1 AND status = 'pending'
        ORDER BY created_at ASC
        LIMIT $2
        """,
        space_id,
        limit + len(snoozed_ids),
    )
    filtered = [row for row in rows if str(row["id"]) not in snoozed_ids]
    return filtered[:limit]


async def fetch_heatmap(conn: asyncpg.Connection, space_id: UUID) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT day::date AS day, coalesce(events, 0) AS events
        FROM (
            SELECT generate_series(
                (current_date - interval '364 days')::date,
                current_date,
                interval '1 day'
            )::date AS day
        ) calendar
        LEFT JOIN (
            SELECT date_trunc('day', created_at)::date AS day, count(*) AS events
            FROM (
                SELECT created_at FROM drive_objects WHERE space_id = $1
                UNION ALL
                SELECT created_at FROM interdept_messages WHERE space_id = $1
                UNION ALL
                SELECT coalesce(resolved_at, created_at) AS created_at
                FROM hitl_requests WHERE space_id = $1 AND status != 'pending'
            ) activity
            WHERE created_at > now() - interval '365 days'
            GROUP BY 1
        ) counts USING (day)
        ORDER BY day ASC
        """,
        space_id,
    )
    points: list[dict[str, Any]] = []
    for row in rows:
        events = int(row["events"] or 0)
        if events == 0:
            level = 0
        elif events <= 1:
            level = 1
        elif events <= 3:
            level = 2
        elif events <= 6:
            level = 3
        else:
            level = 4
        points.append(
            {
                "date": row["day"].isoformat(),
                "level": level,
                "count": events,
            }
        )
    return points


async def fetch_time_machine(
    conn: asyncpg.Connection,
    space_id: UUID,
    *,
    current_score: int,
    rings: dict[str, float],
) -> dict[str, Any]:
    rows = await conn.fetch(
        """
        SELECT week_start, score, rings, factors
        FROM home_score_snapshots
        WHERE space_id = $1
        ORDER BY week_start ASC
        LIMIT 52
        """,
        space_id,
    )
    points = [
        {
            "week_start": row["week_start"].isoformat(),
            "score": int(row["score"]),
            "rings": row["rings"] if isinstance(row["rings"], dict) else {},
            "factors": row["factors"] if isinstance(row["factors"], list) else [],
        }
        for row in rows
    ]
    this_week = week_start_for().isoformat()
    if not points or points[-1]["week_start"] != this_week:
        points.append(
            {
                "week_start": this_week,
                "score": current_score,
                "rings": rings,
                "factors": [],
            }
        )
    return {"points": points}


async def record_home_snapshot(conn: asyncpg.Connection, space_id: UUID) -> None:
    """Persist or refresh this week's momentum snapshot (briefing/cron hook)."""
    pulse = await briefing_svc.fetch_space_pulse(conn, space_id)
    metrics = await fetch_home_metrics(conn, space_id)
    rings = compute_rings(pulse, metrics)
    score = compute_score(rings)
    await maybe_record_weekly_snapshot(conn, space_id, score=score, rings=rings)


async def maybe_record_weekly_snapshot(
    conn: asyncpg.Connection,
    space_id: UUID,
    *,
    score: int,
    rings: dict[str, float],
    factors: list[str] | None = None,
) -> None:
    ws = week_start_for()
    await conn.execute(
        """
        INSERT INTO home_score_snapshots (space_id, week_start, score, rings, factors)
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
        ON CONFLICT (space_id, week_start)
        DO UPDATE SET
            score = EXCLUDED.score,
            rings = EXCLUDED.rings,
            factors = EXCLUDED.factors,
            created_at = now()
        """,
        space_id,
        ws,
        score,
        json.dumps(rings),
        json.dumps(factors or []),
    )


async def score_delta_week(conn: asyncpg.Connection, space_id: UUID, current: int) -> int | None:
    ws = week_start_for()
    prev = await conn.fetchval(
        """
        SELECT score FROM home_score_snapshots
        WHERE space_id = $1 AND week_start < $2
        ORDER BY week_start DESC
        LIMIT 1
        """,
        space_id,
        ws,
    )
    if prev is None:
        return None
    return current - int(prev)


async def build_home_bundle(
    conn: asyncpg.Connection,
    space_id: UUID,
    *,
    preferences: Any = None,
) -> dict[str, Any]:
    row = await conn.fetchrow(
        "SELECT name, ai_lead_config, created_at FROM spaces WHERE id = $1",
        space_id,
    )
    if not row:
        raise ValueError("Space not found")

    cfg = row["ai_lead_config"]
    if isinstance(cfg, str):
        cfg = json.loads(cfg)
    cfg = cfg or {}
    lead = cfg.get("name") or "Jarvis"
    mission = (cfg.get("mission") or "").strip()
    persona = cfg.get("persona")

    pulse = await briefing_svc.fetch_space_pulse(conn, space_id)
    ctx = await briefing_svc.fetch_briefing_context(conn, space_id)
    metrics = await fetch_home_metrics(conn, space_id)
    latest_briefing = await briefing_svc.fetch_latest_briefing(conn, space_id)

    snoozed = active_snoozed_ids(preferences)
    hitl_rows = await fetch_pending_hitl_rows(conn, space_id, snoozed_ids=snoozed)
    focus_cards = [hitl_row_to_focus_card(dict(r), pulse) for r in hitl_rows]

    operating_mode = derive_operating_mode(pulse, writebacks_7d=metrics["writebacks_7d"])
    rings = compute_rings(pulse, metrics)
    score = compute_score(rings)
    delta = await score_delta_week(conn, space_id, score)
    operating_state = derive_operating_state(
        pulse,
        score_delta=delta,
        mode_key=operating_mode["mode"],
    )

    if not focus_cards:
        recs = prioritized_actions(ctx, lead)
        if recs:
            focus_cards = [recommend_to_focus_card(recs[0], 0)]

    also_attention = focus_cards[1:3] if len(focus_cards) > 1 else []
    primary_focus = focus_cards[0] if focus_cards else None
    exclude = {primary_focus["context"]} if primary_focus else set()

    north_star = (cfg.get("north_star") or _DEFAULT_NORTH_STAR).strip()

    bundle = {
        "dna": {
            "mission": mission or "Build the OS for autonomous companies",
            "stage": derive_stage(row["created_at"], pulse),
            "north_star": north_star,
            "archetype": derive_archetype(operating_mode["mode"], persona),
        },
        "pulse": {
            **pulse,
            "greeting": None,
            "greeting_subline": None,
            "greeting_kind": None,
        },
        "operating_mode": operating_mode,
        "operating_state": operating_state,
        "focus_now": primary_focus,
        "also_attention": also_attention,
        "winning_signals": build_winning_signals(score, delta, pulse, ctx),
        "momentum": {
            "score": score,
            "score_delta_week": delta,
            "rings": rings,
            "heatmap": await fetch_heatmap(conn, space_id),
            "time_machine": await fetch_time_machine(
                conn,
                space_id,
                current_score=score,
                rings=rings,
            ),
        },
        "changed": await build_changed_feed_merged(conn, space_id, ctx),
        "learned": parse_learned_insights(
            latest_briefing.get("markdown") if latest_briefing else None,
            ctx,
        ),
        "recommends": build_recommends(ctx, lead, exclude_summaries=exclude),
        "story": await build_story_merged(
            conn,
            space_id,
            space_name=row["name"],
            mission=mission,
            created_at=row["created_at"],
            pulse=pulse,
            automation_count=metrics["automation_count"],
        ),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    return bundle
