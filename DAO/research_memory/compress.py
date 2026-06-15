"""Lossless compression: surface summary + trace pointers (full data kept)."""

from __future__ import annotations

from typing import Any


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def build_surface_from_traces(traces: list[dict[str, Any]], max_tokens: int = 800) -> str:
    """Compress trace steps into prompt-safe surface. Full traces remain in DB."""
    if not traces:
        return ""

    lines: list[str] = []
    for t in traces:
        st = t.get("step_type", "")
        if st == "conclusion":
            lines.append(f"Conclusion: {t.get('output_summary', '')}")
        elif st == "search":
            lines.append(f"Search: {t.get('input_summary', '')} → {t.get('output_summary', '')}")
        elif st == "tool_call":
            tool = t.get("tool_name") or "tool"
            lines.append(f"{tool}: {t.get('output_summary', '')}")
        elif st == "reasoning":
            snippet = (t.get("output_summary") or "")[:200]
            if snippet:
                lines.append(f"Reasoning: {snippet}")
        elif st == "delegate":
            lines.append(f"Delegate: {t.get('output_summary', '')}")
        elif st == "plan":
            lines.append(f"Plan: {(t.get('output_summary') or '')[:150]}")
        elif st == "model_call":
            lines.append(f"Model: {t.get('input_summary', '')} {t.get('output_summary', '')}")
        elif st == "hitl":
            lines.append(f"HITL: {t.get('output_summary', '')}")
        elif st == "error":
            lines.append(f"Error: {(t.get('output_summary') or '')[:120]}")
        elif st == "workflow":
            lines.append(f"Workflow: {t.get('output_summary', '')}")
        elif st == "message":
            snippet = (t.get("output_summary") or t.get("input_summary") or "")[:150]
            if snippet:
                lines.append(f"Message: {snippet}")

    surface = "\n".join(lines)
    budget_chars = max_tokens * 4
    if len(surface) <= budget_chars:
        return surface
    return surface[: budget_chars - 20] + "\n… [expand trace for full detail]"


def build_conclusion(traces: list[dict[str, Any]]) -> dict[str, Any]:
    for t in reversed(traces):
        if t.get("step_type") == "conclusion":
            payload = t.get("payload") or {}
            if isinstance(payload, dict):
                return payload
            return {"text": t.get("output_summary", "")}
    last = traces[-1] if traces else {}
    return {"text": last.get("output_summary", "")}
