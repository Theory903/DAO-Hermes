"""Brain entity upserts from agent-stored knowledge on Drive."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from uuid import UUID

_KNOWLEDGE_PREFIX = "/knowledge/"
_COMPILED_NAMES = frozenset({"compiled.md", "truth.md"})


def slugify_title(title: str) -> str:
    slug = re.sub(r"[^\w-]+", "-", (title or "").lower()).strip("-")
    return (slug[:64] or "entity").strip("-")


def knowledge_slug_from_path(path: str) -> str | None:
    """``/knowledge/acme-corp/compiled.md`` → ``acme-corp``."""
    normalized = path.strip()
    if not normalized.startswith(_KNOWLEDGE_PREFIX):
        return None
    rest = normalized[len(_KNOWLEDGE_PREFIX) :].strip("/")
    if not rest:
        return None
    slug = rest.split("/", 1)[0].strip()
    return slug or None


def is_brain_compiled_path(path: str) -> bool:
    normalized = path.strip().lower()
    if not normalized.startswith(_KNOWLEDGE_PREFIX):
        return False
    filename = normalized.rsplit("/", 1)[-1]
    return filename in _COMPILED_NAMES


async def upsert_brain_entity(
    conn,
    space_id: UUID,
    *,
    slug: str,
    title: str,
    compiled_truth: str,
    drive_ref: UUID,
    confidence: float = 0.65,
) -> None:
    """Merge agent knowledge into ``brain_entities`` (creates row on first store)."""
    slug = slugify_title(slug)
    title = (title or slug.replace("-", " ").title()).strip()[:200]
    confidence = max(0.0, min(float(confidence), 1.0))
    now = datetime.now(timezone.utc)
    timeline_entry = json.dumps(
        {
            "at": now.isoformat(),
            "source": "agent",
            "drive_ref": str(drive_ref),
        }
    )
    await conn.execute(
        """
        INSERT INTO brain_entities (
            space_id, slug, title, compiled_truth, timeline, drive_refs, confidence, updated_at
        )
        VALUES ($1, $2, $3, $4, ARRAY[$5::jsonb], ARRAY[$6::uuid], $7, $8)
        ON CONFLICT (space_id, slug) DO UPDATE SET
            title = EXCLUDED.title,
            compiled_truth = EXCLUDED.compiled_truth,
            confidence = GREATEST(brain_entities.confidence, EXCLUDED.confidence),
            drive_refs = (
                SELECT COALESCE(array_agg(DISTINCT x), '{}')
                FROM unnest(brain_entities.drive_refs || EXCLUDED.drive_refs) AS x
            ),
            timeline = brain_entities.timeline || EXCLUDED.timeline,
            updated_at = EXCLUDED.updated_at
        """,
        space_id,
        slug,
        title,
        compiled_truth,
        timeline_entry,
        drive_ref,
        confidence,
        now,
    )


async def maybe_sync_brain_from_drive_write(
    conn,
    space_id: UUID,
    *,
    path: str,
    content: str,
    object_id: UUID,
    title_hint: str | None = None,
    confidence: float = 0.65,
) -> str | None:
    """When path is ``/knowledge/{slug}/compiled.md``, upsert the matching brain entity."""
    if not is_brain_compiled_path(path):
        return None
    slug = knowledge_slug_from_path(path)
    if not slug:
        return None
    title = title_hint or slug.replace("-", " ").title()
    await upsert_brain_entity(
        conn,
        space_id,
        slug=slug,
        title=title,
        compiled_truth=content.strip(),
        drive_ref=object_id,
        confidence=confidence,
    )
    return slug
