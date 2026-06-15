"""Auto-capture every AI task — git commit per task completion."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, AsyncIterator
from uuid import UUID

import asyncpg

from DAO.research_memory.service import ResearchMemoryService

_log = logging.getLogger(__name__)


class TraceCapture:
    """
    Context manager: one git-like commit per AI task.

    Usage (middleware / supervisor):
        async with TraceCapture(conn, space_id, intent="...", thread_slug="competitor-acme") as cap:
            cap.log_tool("analyze_competitor", input_s, output_s, payload={})
            cap.log_reasoning("Compared tiers...")
            result = await do_work()
            cap.set_conclusion({"done": True})
    """

    def __init__(
        self,
        conn: asyncpg.Connection,
        space_id: UUID,
        intent: str,
        *,
        capability: str = "",
        department: str = "",
        task_type: str = "task",
        thread_slug: str | None = None,
        thread_title: str | None = None,
        parent_session_id: UUID | None = None,
        commit_message: str | None = None,
        agent_id: UUID | None = None,
        workflow_id: UUID | None = None,
        hermes_session_id: str | None = None,
        entity_keys: list[str] | None = None,
        stale_after: datetime | None = None,
        auto_finalize: bool = True,
        force_fresh: bool = False,
    ):
        self._svc = ResearchMemoryService(conn, space_id)
        self._intent = intent
        self._capability = capability
        self._department = department
        self._task_type = task_type
        self._thread_slug = thread_slug
        self._thread_title = thread_title or intent[:120]
        self._parent_session_id = parent_session_id
        self._commit_message = commit_message or intent[:200]
        self._agent_id = agent_id
        self._workflow_id = workflow_id
        self._hermes_session_id = hermes_session_id
        self._entity_keys = entity_keys
        self._stale_after = stale_after
        self._auto_finalize = auto_finalize
        self._force_fresh = force_fresh
        self.session_id: UUID | None = None
        self.thread_id: UUID | None = None
        self.version: int = 1
        self._drive_ref: UUID | None = None
        self._cost_usd: float = 0.0
        self._conclusion_payload: dict | None = None
        self._skipped_reuse = False

    async def __aenter__(self) -> TraceCapture:
        replay = await self._svc.resolve(
            self._intent, self._capability, self._department, self._entity_keys
        )
        if replay and not self._force_fresh and not self._parent_session_id:
            self.session_id = UUID(replay["session_id"])
            self._skipped_reuse = True
            _log.debug("TraceCapture reuse hit session=%s", self.session_id)
            return self

        if self._thread_slug:
            thread = await self._svc.get_or_create_thread(
                self._thread_slug,
                title=self._thread_title,
                capability=self._capability,
                department=self._department,
            )
            self.thread_id = thread["id"]
            if not self._parent_session_id and thread.get("head_session_id"):
                self._parent_session_id = thread["head_session_id"]

        self.session_id = await self._svc.start_session(
            self._intent,
            capability=self._capability,
            department=self._department,
            entity_keys=self._entity_keys,
            stale_after=self._stale_after,
            thread_id=self.thread_id,
            parent_session_id=self._parent_session_id,
            task_type=self._task_type,
            commit_message=self._commit_message,
            agent_id=self._agent_id,
            workflow_id=self._workflow_id,
            hermes_session_id=self._hermes_session_id,
        )
        row = await self._svc.conn.fetchrow(
            "SELECT version, thread_id FROM research_sessions WHERE id = $1",
            self.session_id,
        )
        if row:
            self.version = row["version"] or 1
            if row["thread_id"]:
                self.thread_id = row["thread_id"]
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        if not self.session_id or self._skipped_reuse:
            return
        if exc_type is not None:
            await self._svc.append_trace(
                self.session_id,
                step_type="error",
                input_summary=self._intent,
                output_summary=str(exc)[:2000],
                payload={"error_type": exc_type.__name__ if exc_type else "unknown"},
            )
        if self._conclusion_payload:
            await self._svc.append_trace(
                self.session_id,
                step_type="conclusion",
                output_summary=json_preview(self._conclusion_payload),
                payload=self._conclusion_payload,
            )
        if self._auto_finalize:
            await self._svc.finalize_session(
                self.session_id,
                drive_ref=self._drive_ref,
                cost_usd=self._cost_usd,
                commit_message=self._commit_message,
            )

    @property
    def reused(self) -> bool:
        return self._skipped_reuse

    def set_drive_ref(self, ref: UUID) -> None:
        self._drive_ref = ref

    def set_cost(self, usd: float) -> None:
        self._cost_usd = usd

    def set_conclusion(self, payload: dict) -> None:
        self._conclusion_payload = payload

    async def log(
        self,
        step_type: str,
        input_summary: str = "",
        output_summary: str = "",
        tool_name: str | None = None,
        payload: dict | None = None,
        layer_used: int | None = None,
    ) -> UUID | None:
        if not self.session_id or self._skipped_reuse:
            return None
        return await self._svc.append_trace(
            self.session_id,
            step_type,
            input_summary,
            output_summary,
            tool_name,
            payload,
            layer_used=layer_used,
        )

    async def log_tool(self, name: str, inp: str, out: str, payload: dict | None = None, layer: int | None = None) -> None:
        await self.log("tool_call", inp, out, tool_name=name, payload=payload, layer_used=layer)

    async def log_reasoning(self, text: str, payload: dict | None = None) -> None:
        await self.log("reasoning", output_summary=text, payload=payload)

    async def log_delegate(self, to: str, task: str, payload: dict | None = None) -> None:
        await self.log("delegate", input_summary=task, output_summary=f"Delegated to {to}", payload=payload)

    async def log_model_call(self, model: str, inp_tokens: int, out_tokens: int) -> None:
        await self.log(
            "model_call",
            input_summary=f"{model} in={inp_tokens}",
            output_summary=f"out={out_tokens}",
            payload={"model": model, "in": inp_tokens, "out": out_tokens},
        )


def json_preview(obj: dict, max_len: int = 500) -> str:
    import json

    s = json.dumps(obj, default=str)
    return s if len(s) <= max_len else s[: max_len - 3] + "..."
