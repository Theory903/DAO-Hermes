"""Intent fingerprinting for research dedup."""

from __future__ import annotations

import hashlib
import re


def normalize_intent_text(text: str) -> str:
    t = text.lower().strip()
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"[^\w\s-]", "", t)
    return t


def intent_fingerprint(
    intent: str,
    capability: str = "",
    department: str = "",
    entity_keys: list[str] | None = None,
) -> str:
    """Stable hash for same research intent — used for never-do-twice."""
    parts = [
        normalize_intent_text(capability),
        normalize_intent_text(department),
        normalize_intent_text(intent),
    ]
    if entity_keys:
        parts.extend(sorted(normalize_intent_text(k) for k in entity_keys))
    raw = "|".join(parts)
    return hashlib.sha256(raw.encode()).hexdigest()[:32]
