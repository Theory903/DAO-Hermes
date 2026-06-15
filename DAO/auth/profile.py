"""User profile fields stored on ``users.preferences``."""

from __future__ import annotations

import json
import re
from typing import Any

_BIRTHDAY_RE = re.compile(r"^\d{2}-\d{2}$")

DEFAULT_GREETING_PREFS = {
    "use_chat_opener": True,
}


def _as_dict(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        trimmed = raw.strip()
        if not trimmed:
            return {}
        try:
            parsed = json.loads(trimmed)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def normalize_birthday_mm_dd(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed:
        return None
    if not _BIRTHDAY_RE.match(trimmed):
        raise ValueError("birthday_mm_dd must be MM-DD")
    month, day = (int(part) for part in trimmed.split("-", 1))
    if month < 1 or month > 12 or day < 1 or day > 31:
        raise ValueError("birthday_mm_dd is not a valid calendar date")
    return trimmed


def parse_preferences(raw: Any) -> dict[str, Any]:
    data = _as_dict(raw)
    greeting = {**DEFAULT_GREETING_PREFS, **_as_dict(data.get("greeting"))}
    birthday = data.get("birthday_mm_dd")
    if birthday is not None:
        birthday = normalize_birthday_mm_dd(str(birthday))
    return {
        "birthday_mm_dd": birthday,
        "greeting": greeting,
    }


def merge_preferences(existing: Any, patch: dict[str, Any]) -> dict[str, Any]:
    current = parse_preferences(existing)
    merged = dict(_as_dict(existing))

    if "birthday_mm_dd" in patch:
        value = patch["birthday_mm_dd"]
        if value is None or (isinstance(value, str) and not value.strip()):
            merged.pop("birthday_mm_dd", None)
        else:
            merged["birthday_mm_dd"] = normalize_birthday_mm_dd(str(value))
        merged.pop("greeting_cache", None)

    if "greeting" in patch and isinstance(patch["greeting"], dict):
        greeting = {**current["greeting"], **patch["greeting"]}
        for key in DEFAULT_GREETING_PREFS:
            if key in greeting and greeting[key] is not None:
                greeting[key] = bool(greeting[key])
        merged["greeting"] = greeting

    if "greeting_cache" in patch and isinstance(patch["greeting_cache"], dict):
        cache = {**_as_dict(merged.get("greeting_cache")), **patch["greeting_cache"]}
        merged["greeting_cache"] = cache

    return merged


def greeting_cache_day(now) -> str:
    return now.strftime("%Y-%m-%d")


def read_greeting_cache(preferences: Any, *, space_id: str, day: str) -> dict[str, str] | None:
    entry = _as_dict(_as_dict(preferences).get("greeting_cache")).get(space_id)
    if not isinstance(entry, dict) or entry.get("day") != day:
        return None
    greeting = str(entry.get("greeting") or "").strip()
    if not greeting:
        return None
    return {
        "greeting": greeting,
        "greeting_subline": str(entry.get("greeting_subline") or "").strip(),
        "greeting_kind": str(entry.get("greeting_kind") or "ai"),
    }


def greeting_cache_patch(
    preferences: Any,
    *,
    space_id: str,
    day: str,
    greeting: dict[str, str],
) -> dict[str, Any]:
    cache = dict(_as_dict(_as_dict(preferences).get("greeting_cache")))
    cache[space_id] = {
        "day": day,
        "greeting": greeting.get("greeting"),
        "greeting_subline": greeting.get("greeting_subline"),
        "greeting_kind": greeting.get("greeting_kind") or "ai",
    }
    return {"greeting_cache": cache}


def user_profile_payload(
    *,
    user_id,
    email: str,
    display_name: str | None,
    preferences: Any,
) -> dict[str, Any]:
    prefs = parse_preferences(preferences)
    return {
        "id": str(user_id),
        "email": email,
        "display_name": display_name,
        "preferences": prefs,
        "birthday_mm_dd": prefs.get("birthday_mm_dd"),
    }
