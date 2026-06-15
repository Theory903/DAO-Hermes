"""System-prompt helpers for DAO Space-bound Hermes sessions."""

from __future__ import annotations

from DAO.runtime import RuntimeContext, get_runtime_context


def format_space_volatile_context(ctx: RuntimeContext | None = None) -> str:
    """Volatile tier block: active Space identity + mission (when runtime is bound)."""
    ctx = ctx or get_runtime_context()
    if ctx is None or ctx.space_id is None:
        return ""

    lines = ["## Active Space (DAO OS)"]
    lines.append(f"- Space ID: `{ctx.space_id}`")
    if ctx.space_name:
        lines.append(f"- Space: **{ctx.space_name}**")
    if ctx.lead_name:
        lines.append(
            f"- You are **DAO Agent** ({ctx.lead_name}) for this Space — powered by Hermes."
        )
    else:
        lines.append("- You are **DAO Agent** for this Space — powered by Hermes.")
    if ctx.mission:
        lines.append(f"- Mission: {ctx.mission}")
    if ctx.tier:
        lines.append(f"- Tier: {ctx.tier}")
    lines.append(f"- Hermes home (this session): `{ctx.personal_home}`")
    lines.append(
        "- When you need company state, `DAO_pulse` and `DAO_reports` are the "
        "intended tools; volatile context above already names this Space."
    )
    lines.append(
        "- Operate through company tools: navigate UI, read pulse/reports, "
        "delegate to department Workers, write artifacts to Drive."
    )
    return "\n".join(lines)
