"""Unit tests for Trace Git versioning (no DB)."""

from DAO.research_memory.versioning import build_trace_manifest, diff_commits, snapshot_hash


def test_snapshot_hash_stable():
    traces = [
        {"step_index": 0, "step_type": "reasoning", "output_summary": "think", "payload": {}},
        {"step_index": 1, "step_type": "tool_call", "tool_name": "x", "output_summary": "done", "payload": {"a": 1}},
    ]
    h1 = snapshot_hash(traces, "surface", {"text": "ok"})
    h2 = snapshot_hash(traces, "surface", {"text": "ok"})
    assert h1 == h2
    assert len(h1) == 64


def test_diff_commits_detects_changes():
    left = [{"step_index": 0, "step_type": "reasoning", "output_summary": "old"}]
    right = [
        {"step_index": 0, "step_type": "reasoning", "output_summary": "new"},
        {"step_index": 1, "step_type": "tool_call", "output_summary": "added"},
    ]
    meta_l = {"session_id": "a", "version": 1, "commit_message": "v1", "snapshot_hash": "x", "surface_summary": "s1", "conclusion": {}}
    meta_r = {"session_id": "b", "version": 2, "commit_message": "v2", "snapshot_hash": "y", "surface_summary": "s2", "conclusion": {}}
    d = diff_commits(left, right, meta_l, meta_r)
    assert d["steps_modified"] == 1
    assert d["steps_added"] == 1
    assert d["surface_changed"] is True


def test_build_trace_manifest():
    traces = [{"step_type": "tool_call", "tool_name": "search", "output_summary": "results"}]
    m = build_trace_manifest(traces)
    assert m[0]["step_type"] == "tool_call"
    assert "results" in m[0]["output_preview"]
