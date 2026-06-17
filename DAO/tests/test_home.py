"""Tests for Home 6.0 bundle derivation (pure functions)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from DAO.jarvis.briefing import BriefingContext
from DAO.jarvis.home import (
    active_snoozed_ids,
    build_winning_signals,
    compute_score,
    derive_operating_mode,
    derive_operating_state,
    hitl_row_to_focus_card,
)


def _ctx(pulse: dict) -> BriefingContext:
    return BriefingContext(
        pulse=pulse,
        hitl_pending=[],
        handoffs_24h=[],
        drive_recent=[],
        writebacks=[],
    )


def test_operating_mode_execution_when_hitl_pending():
    pulse = {
        "pending_hitl": 1,
        "handoffs_24h": 0,
        "drive_artifacts_24h": 0,
        "brain_entities": 0,
    }
    mode = derive_operating_mode(pulse)
    assert mode["mode"] == "execution"
    assert mode["focus_label"] == "Shipping commitments"


def test_operating_mode_growth_when_shipping():
    pulse = {
        "pending_hitl": 0,
        "handoffs_24h": 0,
        "drive_artifacts_24h": 4,
        "brain_entities": 1,
    }
    mode = derive_operating_mode(pulse)
    assert mode["mode"] == "growth"


def test_operating_state_warning_for_backlog():
    pulse = {"pending_hitl": 2, "handoffs_24h": 0, "drive_artifacts_24h": 0, "brain_entities": 0}
    state = derive_operating_state(pulse, score_delta=None, mode_key="execution")
    assert state["tone"] == "warning"
    assert state["label"] == "Needs attention"


def test_momentum_score_from_rings():
    rings = {"growth": 0.5, "execution": 0.5, "learning": 0.5, "autonomy": 1.0}
    assert compute_score(rings) == 62


def test_focus_card_includes_why_this_matters():
    pulse = {"pending_hitl": 2, "handoffs_24h": 0, "drive_artifacts_24h": 0, "brain_entities": 0}
    card = hitl_row_to_focus_card(
        {"id": "abc", "action_summary": "Review pricing strategy"},
        pulse,
    )
    assert card["kind"] == "hitl"
    assert card["why_this_matters"]
    assert "price" in card["why_this_matters"].lower() or "queue" in card["why_this_matters"].lower()


def test_winning_signals_prefers_narrative_lines():
    pulse = {"pending_hitl": 0, "handoffs_24h": 0, "drive_artifacts_24h": 3, "brain_entities": 2}
    lines = build_winning_signals(70, 6, pulse, _ctx(pulse))
    assert len(lines) <= 3
    assert any("accelerating" in line.lower() or "shipped" in line.lower() for line in lines)


def test_snooze_filters_expired_ids():
    now = datetime.now(timezone.utc)
    future = (now + timedelta(days=1)).isoformat()
    past = (now - timedelta(days=1)).isoformat()
    prefs = {
        "home_focus_snooze": {
            "keep-me": future,
            "drop-me": past,
        }
    }
    active = active_snoozed_ids(prefs, now=now)
    assert "keep-me" in active
    assert "drop-me" not in active


def test_focus_ranking_isolated_by_space_pulse():
    """Two spaces with different HITL backlog should derive different operating states."""
    space_a = {"pending_hitl": 0, "handoffs_24h": 1, "drive_artifacts_24h": 5, "brain_entities": 3}
    space_b = {"pending_hitl": 3, "handoffs_24h": 0, "drive_artifacts_24h": 0, "brain_entities": 1}

    mode_a = derive_operating_mode(space_a)
    mode_b = derive_operating_mode(space_b)

    assert mode_a["mode"] != mode_b["mode"]
    state_a = derive_operating_state(space_a, score_delta=5, mode_key=mode_a["mode"])
    state_b = derive_operating_state(space_b, score_delta=None, mode_key=mode_b["mode"])
    assert state_a["tone"] == "positive"
    assert state_b["tone"] == "warning"


if __name__ == "__main__":
    for name in sorted(globals()):
        if name.startswith("test_"):
            globals()[name]()
            print(name, "ok")
    print("all passed")
