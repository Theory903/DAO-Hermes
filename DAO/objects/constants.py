"""Company Graph enums and allowed values."""

from __future__ import annotations

OBJECT_TYPES = frozenset({
    "project",
    "decision",
    "meeting",
    "document",
    "customer",
    "conversation",
    "task",
    "event",
})

EDGE_TYPES = frozenset({
    "related_to",
    "created_from",
    "resulted_in",
    "assigned_to",
})

OBJECT_STATUSES = frozenset({"pending", "active", "archived", "failed"})

SOURCE_KINDS = frozenset({"live", "backfill", "inferred"})
