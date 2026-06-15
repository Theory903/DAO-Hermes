"""Tests for personalized home greeting."""

from DAO.jarvis.greeting import _fallback_greeting, _parse_greeting_json, build_home_greeting


def test_build_home_greeting_uses_ai_payload():
    result = build_home_greeting(
        display_name="Abhishek Jha",
        lead_name="Jarvis",
        ai_greeting={
            "greeting": "Ready to ship something great today, Abhishek?",
            "greeting_subline": "Jarvis has your briefing below.",
            "greeting_kind": "ai",
        },
    )
    assert result["greeting"] == "Ready to ship something great today, Abhishek?"
    assert result["greeting_subline"] == "Jarvis has your briefing below."
    assert result["greeting_kind"] == "ai"


def test_build_home_greeting_fallback_without_ai():
    result = build_home_greeting(display_name="Alex", lead_name="Jarvis")
    assert result["greeting"] == "Welcome back, Alex."
    assert "Jarvis" in result["greeting_subline"]
    assert result["greeting_kind"] == "fallback"


def test_parse_greeting_json_accepts_fenced_payload():
    parsed = _parse_greeting_json(
        '```json\n{"headline": "Hey Priya.", "subline": "Jarvis is on deck."}\n```'
    )
    assert parsed is not None
    assert parsed["greeting"] == "Hey Priya."
    assert parsed["greeting_subline"] == "Jarvis is on deck."
    assert parsed["greeting_kind"] == "ai"


def test_fallback_greeting_without_name():
    result = _fallback_greeting(display_name=None, lead_name="Jarvis")
    assert result["greeting"] == "Welcome back."
    assert result["greeting_kind"] == "fallback"
