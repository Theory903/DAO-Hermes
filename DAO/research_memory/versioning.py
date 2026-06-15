"""Git-like snapshots and diffs for trace commits."""

from __future__ import annotations

import hashlib
import json
from typing import Any


def snapshot_hash(traces: list[dict[str, Any]], surface: str, conclusion: dict) -> str:
    """Content-addressable hash for a commit — like git tree SHA."""
    manifest = []
    for t in traces:
        manifest.append(
            {
                "step_index": t.get("step_index"),
                "step_type": t.get("step_type"),
                "tool_name": t.get("tool_name"),
                "input": (t.get("input_summary") or "")[:500],
                "output": (t.get("output_summary") or "")[:500],
                "payload_hash": hashlib.sha256(
                    json.dumps(t.get("payload") or {}, sort_keys=True, default=str).encode()
                ).hexdigest()[:16],
            }
        )
    blob = json.dumps(
        {"manifest": manifest, "surface": surface, "conclusion": conclusion},
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(blob.encode()).hexdigest()


def build_trace_manifest(traces: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for i, t in enumerate(traces):
        out.append(
            {
                "step_index": t.get("step_index", i),
                "step_type": t.get("step_type"),
                "tool_name": t.get("tool_name"),
                "output_preview": (t.get("output_summary") or "")[:200],
            }
        )
    return out


def diff_commits(
    left_steps: list[dict[str, Any]],
    right_steps: list[dict[str, Any]],
    left_meta: dict[str, Any],
    right_meta: dict[str, Any],
) -> dict[str, Any]:
    """Diff two commit trace lists — git diff style summary."""
    left_by_idx = {s.get("step_index", i): s for i, s in enumerate(left_steps)}
    right_by_idx = {s.get("step_index", i): s for i, s in enumerate(right_steps)}
    all_idx = sorted(set(left_by_idx) | set(right_by_idx))

    changes: list[dict[str, Any]] = []
    for idx in all_idx:
        lo, ro = left_by_idx.get(idx), right_by_idx.get(idx)
        if lo is None:
            changes.append({"change": "added", "step_index": idx, "step": ro})
        elif ro is None:
            changes.append({"change": "removed", "step_index": idx, "step": lo})
        elif (lo.get("output_summary") or "") != (ro.get("output_summary") or ""):
            changes.append(
                {
                    "change": "modified",
                    "step_index": idx,
                    "before": lo.get("output_summary", "")[:300],
                    "after": ro.get("output_summary", "")[:300],
                    "step_type": ro.get("step_type") or lo.get("step_type"),
                }
            )

    return {
        "left": {
            "session_id": left_meta.get("session_id"),
            "version": left_meta.get("version"),
            "commit_message": left_meta.get("commit_message"),
            "snapshot_hash": left_meta.get("snapshot_hash"),
        },
        "right": {
            "session_id": right_meta.get("session_id"),
            "version": right_meta.get("version"),
            "commit_message": right_meta.get("commit_message"),
            "snapshot_hash": right_meta.get("snapshot_hash"),
        },
        "surface_changed": left_meta.get("surface_summary") != right_meta.get("surface_summary"),
        "conclusion_changed": left_meta.get("conclusion") != right_meta.get("conclusion"),
        "step_changes": changes,
        "steps_added": sum(1 for c in changes if c["change"] == "added"),
        "steps_removed": sum(1 for c in changes if c["change"] == "removed"),
        "steps_modified": sum(1 for c in changes if c["change"] == "modified"),
    }
