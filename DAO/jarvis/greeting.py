"""AI-generated home greeting for Space home + briefing API."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

_log = logging.getLogger(__name__)

_JSON_FENCE = re.compile(r"```(?:json)?\s*(.+?)```", re.DOTALL | re.IGNORECASE)


def _first_name(display_name: str | None) -> str | None:
    raw = (display_name or "").strip()
    if not raw:
        return None
    return raw.split()[0]


def _fallback_greeting(
    *,
    display_name: str | None,
    lead_name: str,
) -> dict[str, str]:
    name = _first_name(display_name)
    lead = (lead_name or "Jarvis").strip() or "Jarvis"
    headline = f"Welcome back, {name}." if name else "Welcome back."
    return {
        "greeting": headline,
        "greeting_subline": f"{lead} is ready when you are.",
        "greeting_kind": "fallback",
    }


def _parse_greeting_json(text: str) -> dict[str, str] | None:
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
    if not isinstance(data, dict):
        return None
    headline = str(data.get("headline") or data.get("greeting") or "").strip()
    subline = str(data.get("subline") or data.get("greeting_subline") or "").strip()
    if not headline:
        return None
    if len(headline) > 180:
        headline = headline[:177].rstrip() + "..."
    if subline and len(subline) > 200:
        subline = subline[:197].rstrip() + "..."
    return {
        "greeting": headline,
        "greeting_subline": subline or "",
        "greeting_kind": "ai",
    }


def _generate_greeting_sync(
    *,
    display_name: str | None,
    lead_name: str,
    space_name: str,
    birthday_mm_dd: str | None,
    now: datetime,
    context: dict[str, Any] | None,
) -> dict[str, str]:
    from agent.auxiliary_client import call_llm

    stamp = now.strftime("%A, %B %d, %Y")
    name = display_name or "the user"
    birthday_line = (
        f"The user's birthday is {birthday_mm_dd} (month-day, no year). "
        "Mention it naturally only when today matches."
        if birthday_mm_dd
        else "No birthday on file."
    )
    stats = context or {}
    stats_block = "\n".join(f"- {key}: {value}" for key, value in stats.items() if value is not None)

    system = (
        "You write short, warm home-screen greetings for an AI company OS. "
        "Decide tone and content yourself from the date, user context, and Space status. "
        "Do not use markdown. Return JSON only."
    )
    user = f"""Today: {stamp}
Space: {space_name}
AI Lead name: {lead_name}
User display name: {name}
{birthday_line}

Space pulse (optional):
{stats_block or "- (none)"}

Write a personalized greeting headline and one short subline for the home hero.

Rules:
- headline: one sentence, max 120 characters, conversational, no lists
- subline: one sentence referencing {lead_name} and today's focus, max 140 characters
- Consider holidays, weekends, time of day, birthdays, and workload only when relevant
- Sound human, not corporate

Return JSON: {{"headline": "...", "subline": "..."}}"""

    try:
        response = call_llm(
            task="title_generation",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.7,
            max_tokens=180,
        )
        text = (response.choices[0].message.content or "").strip()
        parsed = _parse_greeting_json(text)
        if parsed:
            if not parsed["greeting_subline"]:
                parsed["greeting_subline"] = f"{lead_name} is on the floor."
            return parsed
    except Exception:
        _log.debug("AI home greeting failed", exc_info=True)

    return _fallback_greeting(display_name=display_name, lead_name=lead_name)


async def generate_home_greeting(
    *,
    display_name: str | None,
    lead_name: str,
    space_name: str,
    birthday_mm_dd: str | None = None,
    now: datetime | None = None,
    context: dict[str, Any] | None = None,
) -> dict[str, str]:
    """Ask the configured model for a personalized home greeting."""
    now = now or datetime.now(timezone.utc)
    return await asyncio.to_thread(
        _generate_greeting_sync,
        display_name=display_name,
        lead_name=lead_name,
        space_name=space_name,
        birthday_mm_dd=birthday_mm_dd,
        now=now,
        context=context,
    )


def build_home_greeting(
    *,
    display_name: str | None = None,
    lead_name: str = "Jarvis",
    ai_greeting: dict[str, str] | None = None,
) -> dict[str, str]:
    """Attach greeting fields to a briefing payload (sync fallback path)."""
    if ai_greeting and ai_greeting.get("greeting"):
        return {
            "greeting": ai_greeting["greeting"],
            "greeting_subline": ai_greeting.get("greeting_subline") or "",
            "greeting_kind": ai_greeting.get("greeting_kind") or "ai",
        }
    return _fallback_greeting(display_name=display_name, lead_name=lead_name)
