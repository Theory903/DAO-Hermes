"""Hierarchical AI Lead supervisor — routes Board messages to department leads.

LangGraph is not a dependency yet; this module implements the same graph as an
explicit state machine (classify → enrich → finalize) so the gateway can inject
department context before Hermes runs delegate_task.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable

_SUPERVISOR_BLOCK_RE = re.compile(
    r"<DAO-supervisor>.*?</DAO-supervisor>\s*",
    re.DOTALL | re.IGNORECASE,
)

ROUTING_DEPARTMENTS = ("research", "engineering", "marketing", "sales", "ops")

DEPT_LABELS: dict[str, str] = {
    "research": "Research",
    "engineering": "Engineering",
    "marketing": "Marketing",
    "sales": "Sales",
    "ops": "Operations",
}

# Suggested Hermes toolsets per department (delegate_task `toolsets` param).
DEPT_TOOLSETS: dict[str, list[str]] = {
    "research": ["web", "file"],
    "engineering": ["terminal", "file", "web"],
    "marketing": ["web", "file"],
    "sales": ["web", "file"],
    "ops": ["terminal", "file"],
}

DEPT_KEYWORDS: dict[str, tuple[str, ...]] = {
    "research": (
        "research",
        "competitor",
        "market",
        "analyze",
        "analysis",
        "study",
        "survey",
        "intel",
    ),
    "engineering": (
        "code",
        "bug",
        "deploy",
        "api",
        "fix",
        "implement",
        "build",
        "refactor",
        "test",
        "pr",
    ),
    "marketing": (
        "blog",
        "content",
        "seo",
        "campaign",
        "brand",
        "social",
        "copy",
        "newsletter",
        "landing page",
    ),
    "sales": (
        "lead",
        "deal",
        "crm",
        "outreach",
        "pipeline",
        "prospect",
        "demo",
        "quota",
        "close",
    ),
    "ops": (
        "incident",
        "ops",
        "monitor",
        "alert",
        "uptime",
        "oncall",
        "on-call",
        "infra",
        "sre",
        "outage",
        "setup",
        "set up",
        "configure",
        "onboard",
        "bootstrap",
        "provision",
        "initialize",
        "health check",
    ),
}


def strip_supervisor_block(message: str) -> str:
    """Return user text without any prior ``<DAO-supervisor>`` injection."""
    if not message:
        return ""
    return _SUPERVISOR_BLOCK_RE.sub("", message).strip()


@dataclass
class SupervisorState:
    mission: str = ""
    user_message: str = ""
    delegated_to: str | None = None
    routing_reason: str = ""
    dept_context: str = ""
    delegate_hint: dict[str, Any] = field(default_factory=dict)
    tool_trace: list[dict[str, Any]] = field(default_factory=list)


SupervisorStep = Callable[[SupervisorState], SupervisorState]


def classify_department(message: str) -> tuple[str | None, str]:
    """Score keyword hits and return (department, reason)."""
    msg = strip_supervisor_block(message).lower()
    if not msg.strip():
        return None, "empty message"

    scores: dict[str, int] = {}
    matched: dict[str, list[str]] = {}
    for dept, keywords in DEPT_KEYWORDS.items():
        hits = [kw for kw in keywords if kw in msg]
        if hits:
            scores[dept] = len(hits)
            matched[dept] = hits

    if not scores:
        return None, "no department keywords matched"

    best_score = max(scores.values())
    winners = [d for d, s in scores.items() if s == best_score]
    # Stable tie-break: ROUTING_DEPARTMENTS order.
    dept = min(winners, key=lambda d: ROUTING_DEPARTMENTS.index(d))
    kw = ", ".join(matched[dept][:3])
    return dept, f"keyword match ({kw})"


def _step_classify(state: SupervisorState) -> SupervisorState:
    dept, reason = classify_department(state.user_message)
    state.delegated_to = dept
    state.routing_reason = reason
    state.tool_trace.append({"node": "classify", "department": dept, "reason": reason})
    return state


def _step_enrich(state: SupervisorState) -> SupervisorState:
    dept = state.delegated_to
    if dept is None:
        state.dept_context = (
            "No single department matched. You are AI Lead — decide what this turn "
            "needs: converse, clarify scope, orient with DAO_pulse/DAO_reports, or "
            "delegate via delegate_task. Routing is a hint, not a script."
        )
        state.delegate_hint = {
            "action": "clarify_or_delegate",
            "tool": "delegate_task",
        }
    else:
        label = DEPT_LABELS.get(dept, dept.title())
        toolsets = DEPT_TOOLSETS.get(dept, ["web", "file"])
        mission_line = f"Company mission: {state.mission}\n" if state.mission else ""
        state.dept_context = (
            f"{mission_line}"
            f"Routed to {label} ({dept}). "
            f"Delegate execution to the {label} Lead using delegate_task. "
            f"Include department={dept!r} in the context string for Drive writeback."
        )
        state.delegate_hint = {
            "action": "delegate_task",
            "department": dept,
            "toolsets": toolsets,
            "goal": state.user_message,
            "context": state.dept_context,
        }
    state.tool_trace.append({"node": "enrich", "delegate_hint": state.delegate_hint})
    return state


def _step_finalize(state: SupervisorState) -> SupervisorState:
    state.tool_trace.append({"node": "finalize", "delegated_to": state.delegated_to})
    return state


_SUPERVISOR_STEPS: tuple[SupervisorStep, ...] = (
    _step_classify,
    _step_enrich,
    _step_finalize,
)


class Supervisor:
    """Minimal hierarchical supervisor graph (AI Lead → department lead)."""

    def __init__(self, steps: tuple[SupervisorStep, ...] | None = None) -> None:
        self._steps = steps or _SUPERVISOR_STEPS

    def run(self, *, user_message: str, mission: str = "") -> SupervisorState:
        state = SupervisorState(user_message=user_message, mission=mission)
        for step in self._steps:
            state = step(state)
        return state

    def route(self, state: SupervisorState) -> SupervisorState:
        """Advance an existing state through the graph."""
        for step in self._steps:
            state = step(state)
        return state


def route_message(state: SupervisorState) -> SupervisorState:
    """Backward-compatible entry: run routing on an existing state object."""
    return Supervisor().route(state)


def build_prompt_injection(state: SupervisorState) -> str:
    """Ephemeral routing hint for the AI Lead turn (prepended to user prompt)."""
    dept = state.delegated_to or "unassigned"
    hint = state.delegate_hint or {}
    toolsets = hint.get("toolsets") or []
    toolsets_s = ", ".join(toolsets) if toolsets else "inherit"
    if state.delegated_to:
        body = (
            f"department: {dept}\n"
            f"routing: {state.routing_reason}\n"
            f"{state.dept_context}\n"
            f"suggested_toolsets: {toolsets_s}\n"
            "guidance: prefer DAO_pulse/DAO_reports for company state and "
            "delegate_task for cross-dept execution — you choose when each fits.\n"
        )
    else:
        body = (
            f"department: {dept}\n"
            f"routing: {state.routing_reason}\n"
            f"{state.dept_context}\n"
            "guidance: company tools (DAO_pulse, DAO_reports, DAO_navigate) beat "
            "terminal/filesystem when orienting on Space work — use your judgment.\n"
        )
    return f"<DAO-supervisor>\n{body}</DAO-supervisor>\n\n"


def routing_payload(state: SupervisorState) -> dict[str, Any]:
    """JSON-safe routing summary for WS / SSE consumers."""
    return {
        "department": state.delegated_to,
        "routing_reason": state.routing_reason,
        "delegate_hint": state.delegate_hint,
        "trace": state.tool_trace,
    }
