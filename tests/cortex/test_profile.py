"""Unit tests for user profile preferences."""

from __future__ import annotations

import pytest

from DAO.auth.profile import merge_preferences, normalize_birthday_mm_dd, parse_preferences, read_greeting_cache


def test_normalize_birthday_valid():
    assert normalize_birthday_mm_dd("06-14") == "06-14"


def test_normalize_birthday_invalid():
    with pytest.raises(ValueError):
        normalize_birthday_mm_dd("6-14")
    with pytest.raises(ValueError):
        normalize_birthday_mm_dd("13-40")


def test_parse_preferences_defaults():
    prefs = parse_preferences({})
    assert prefs["birthday_mm_dd"] is None
    assert prefs["greeting"]["use_chat_opener"] is True


def test_merge_preferences_birthday_and_greeting():
    merged = merge_preferences(
        {},
        {
            "birthday_mm_dd": "03-21",
            "greeting": {"use_chat_opener": False},
        },
    )
    assert merged["birthday_mm_dd"] == "03-21"
    assert merged["greeting"]["use_chat_opener"] is False


def test_merge_preferences_clear_birthday():
    merged = merge_preferences({"birthday_mm_dd": "01-01"}, {"birthday_mm_dd": None})
    assert "birthday_mm_dd" not in merged


def test_parse_preferences_json_string():
    prefs = parse_preferences('{"birthday_mm_dd": "06-14", "greeting": {"use_chat_opener": false}}')
    assert prefs["birthday_mm_dd"] == "06-14"
    assert prefs["greeting"]["use_chat_opener"] is False


def test_read_greeting_cache_from_json_string():
    raw = '{"greeting_cache": {"space-1": {"day": "2026-06-14", "greeting": "Hi", "greeting_subline": "There", "greeting_kind": "ai"}}}'
    cached = read_greeting_cache(raw, space_id="space-1", day="2026-06-14")
    assert cached == {
        "greeting": "Hi",
        "greeting_subline": "There",
        "greeting_kind": "ai",
    }
