"""Tests for morning briefing content helpers."""

from datetime import datetime, timezone

from DAO.jarvis.briefing import (
    BriefingContext,
    briefing_headline,
    prioritized_actions,
    render_briefing_markdown,
)


def _ctx(**overrides) -> BriefingContext:
    base = BriefingContext(
        pulse={
            "pending_hitl": 0,
            "handoffs_24h": 0,
            "drive_artifacts_24h": 0,
            "brain_entities": 2,
        },
        hitl_pending=[],
        handoffs_24h=[],
        drive_recent=[],
        writebacks=[],
    )
    if not overrides:
        return base
    data = {
        "pulse": overrides.pop("pulse", base.pulse),
        "hitl_pending": overrides.pop("hitl_pending", base.hitl_pending),
        "handoffs_24h": overrides.pop("handoffs_24h", base.handoffs_24h),
        "drive_recent": overrides.pop("drive_recent", base.drive_recent),
        "writebacks": overrides.pop("writebacks", base.writebacks),
    }
    data.update(overrides)
    return BriefingContext(**data)


def test_headline_prioritizes_hitl():
    ctx = _ctx(
        pulse={"pending_hitl": 2, "handoffs_24h": 1, "drive_artifacts_24h": 3, "brain_entities": 0},
        hitl_pending=[{"action_summary": "Publish pricing page", "created_at": datetime.now(timezone.utc)}],
    )
    headline = briefing_headline(ctx)
    assert "2 approvals" in headline
    assert "Inbox" in headline


def test_headline_handoff_when_no_hitl():
    ctx = _ctx(
        pulse={"pending_hitl": 0, "handoffs_24h": 1, "drive_artifacts_24h": 0, "brain_entities": 0},
        handoffs_24h=[
            {
                "from_dept": "research",
                "to_dept": "marketing",
                "subject": "Q2 competitor matrix",
                "msg_type": "handoff",
                "created_at": datetime.now(timezone.utc),
            }
        ],
    )
    headline = briefing_headline(ctx)
    assert "Research" in headline
    assert "Marketing" in headline
    assert "competitor" in headline


def test_prioritized_actions_cap_at_three():
    ctx = _ctx(
        pulse={"pending_hitl": 2, "handoffs_24h": 2, "drive_artifacts_24h": 1, "brain_entities": 1},
        hitl_pending=[
            {"action_summary": "Approve ad spend", "created_at": datetime.now(timezone.utc)},
            {"action_summary": "Ship landing page", "created_at": datetime.now(timezone.utc)},
        ],
        handoffs_24h=[
            {
                "from_dept": "ops",
                "to_dept": "research",
                "subject": "Vendor shortlist",
                "msg_type": "handoff",
                "created_at": datetime.now(timezone.utc),
            }
        ],
        writebacks=[{"path": "/writeback/research/competitors.md", "produced_by_dept": "research"}],
    )
    actions = prioritized_actions(ctx, "Jarvis")
    assert len(actions) == 3
    assert any("Inbox" in a for a in actions)


def test_render_includes_scoreboard_and_sections():
    ctx = _ctx(
        pulse={"pending_hitl": 1, "handoffs_24h": 0, "drive_artifacts_24h": 2, "brain_entities": 5},
        hitl_pending=[{"action_summary": "Deploy cron change", "created_at": datetime.now(timezone.utc)}],
        drive_recent=[{"path": "/drive/marketing/blog-draft.md", "produced_by_dept": "marketing", "created_at": None}],
    )
    md = render_briefing_markdown(
        space_name="Acme",
        lead="Jarvis",
        mission="Ship faster with less rework.",
        stamp="Monday, June 15",
        ctx=ctx,
    )
    assert "# Morning Briefing — Acme" in md
    assert "## Needs you now" in md
    assert "## Do these three first" in md
    assert "| HITL pending | 1 |" in md
    assert "blog-draft.md" in md
