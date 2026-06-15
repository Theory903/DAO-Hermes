"""Research Memory service — resolve, capture, expand."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import asyncpg

from DAO.research_memory.compress import (
    build_conclusion,
    build_surface_from_traces,
    estimate_tokens,
)
from DAO.research_memory.fingerprint import intent_fingerprint
from DAO.research_memory.versioning import (
    build_trace_manifest,
    diff_commits,
    snapshot_hash,
)


class ResearchMemoryService:
    def __init__(self, conn: asyncpg.Connection, space_id: UUID):
        self.conn = conn
        self.space_id = space_id

    async def resolve(
        self,
        intent: str,
        capability: str = "",
        department: str = "",
        entity_keys: list[str] | None = None,
        max_age_hours: int = 168,
        similarity_threshold: float = 0.85,
    ) -> dict[str, Any] | None:
        """
        Check if this research was already done.
        Returns replay bundle — agent skips planning and re-execution.
        """
        fp = intent_fingerprint(intent, capability, department, entity_keys)
        row = await self.conn.fetchrow(
            """
            SELECT id, surface_summary, conclusion, drive_ref, trace_count,
                   token_surface, created_at, stale_after, thread_id, version, snapshot_hash
            FROM research_sessions
            WHERE space_id = $1
              AND intent_fingerprint = $2
              AND status = 'completed'
              AND (stale_after IS NULL OR stale_after > now())
              AND created_at > now() - ($3 || ' hours')::interval
            ORDER BY created_at DESC
            LIMIT 1
            """,
            self.space_id,
            fp,
            str(max_age_hours),
        )
        if not row:
            return None

        return {
            "reuse": True,
            "session_id": str(row["id"]),
            "intent_fingerprint": fp,
            "surface_summary": row["surface_summary"],
            "conclusion": row["conclusion"] if isinstance(row["conclusion"], dict) else json.loads(row["conclusion"] or "{}"),
            "drive_ref": str(row["drive_ref"]) if row["drive_ref"] else None,
            "trace_count": row["trace_count"],
            "token_surface": row["token_surface"],
            "thread_id": str(row["thread_id"]) if row.get("thread_id") else None,
            "version": row.get("version", 1),
            "snapshot_hash": row.get("snapshot_hash"),
            "replay_hint": "Call expand_trace(session_id) or checkout(session_id) for full history.",
            "score": similarity_threshold,
        }

    async def get_or_create_thread(
        self,
        slug: str,
        title: str = "",
        capability: str = "",
        department: str = "",
    ) -> dict[str, Any]:
        slug = slug.strip().lower().replace(" ", "-")[:120]
        row = await self.conn.fetchrow(
            "SELECT * FROM trace_threads WHERE space_id = $1 AND slug = $2",
            self.space_id,
            slug,
        )
        if row:
            return self._thread_row(row)
        tid = await self.conn.fetchval(
            """
            INSERT INTO trace_threads (space_id, slug, title, capability, department)
            VALUES ($1, $2, $3, $4, $5) RETURNING id
            """,
            self.space_id,
            slug,
            title or slug,
            capability,
            department,
        )
        row = await self.conn.fetchrow("SELECT * FROM trace_threads WHERE id = $1", tid)
        return self._thread_row(row)

    async def get_thread(self, thread_id: UUID) -> dict[str, Any] | None:
        row = await self.conn.fetchrow(
            "SELECT * FROM trace_threads WHERE id = $1 AND space_id = $2",
            thread_id,
            self.space_id,
        )
        return self._thread_row(row) if row else None

    def _thread_row(self, row: asyncpg.Record) -> dict[str, Any]:
        return {
            "id": row["id"],
            "slug": row["slug"],
            "title": row["title"],
            "capability": row["capability"],
            "department": row["department"],
            "head_session_id": row["head_session_id"],
            "commit_count": row["commit_count"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        }

    async def start_session(
        self,
        intent: str,
        capability: str = "",
        department: str = "",
        entity_keys: list[str] | None = None,
        stale_after: datetime | None = None,
        thread_id: UUID | None = None,
        parent_session_id: UUID | None = None,
        task_type: str = "task",
        commit_message: str = "",
        agent_id: UUID | None = None,
        workflow_id: UUID | None = None,
        hermes_session_id: str | None = None,
    ) -> UUID:
        fp = intent_fingerprint(intent, capability, department, entity_keys)
        version = 1
        if thread_id:
            version = await self.conn.fetchval(
                "SELECT COALESCE(MAX(version), 0) + 1 FROM research_sessions WHERE thread_id = $1",
                thread_id,
            )
        sid = await self.conn.fetchval(
            """
            INSERT INTO research_sessions
                (space_id, intent_fingerprint, intent_raw, capability, department, stale_after,
                 thread_id, parent_session_id, version, task_type, commit_message,
                 agent_id, workflow_id, hermes_session_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING id
            """,
            self.space_id,
            fp,
            intent,
            capability,
            department,
            stale_after,
            thread_id,
            parent_session_id,
            version,
            task_type,
            commit_message or intent[:200],
            agent_id,
            workflow_id,
            hermes_session_id,
        )
        await self.append_trace(
            sid,
            step_type="intent",
            input_summary=intent,
            output_summary="Session started",
            payload={"entity_keys": entity_keys or []},
        )
        return sid

    async def append_trace(
        self,
        session_id: UUID,
        step_type: str,
        input_summary: str = "",
        output_summary: str = "",
        tool_name: str | None = None,
        payload: dict | None = None,
        drive_refs: list[UUID] | None = None,
        layer_used: int | None = None,
    ) -> UUID:
        idx = await self.conn.fetchval(
            "SELECT COALESCE(MAX(step_index), -1) + 1 FROM research_traces WHERE session_id = $1",
            session_id,
        )
        payload_json = json.dumps(payload or {})
        tid = await self.conn.fetchval(
            """
            INSERT INTO research_traces
                (space_id, session_id, step_index, step_type, tool_name,
                 input_summary, output_summary, payload, drive_refs,
                 token_estimate, layer_used)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
            RETURNING id
            """,
            self.space_id,
            session_id,
            idx,
            step_type,
            tool_name,
            input_summary[:2000],
            output_summary[:4000],
            payload_json,
            drive_refs or [],
            estimate_tokens(input_summary + output_summary),
            layer_used,
        )
        await self.conn.execute(
            "UPDATE research_sessions SET trace_count = trace_count + 1 WHERE id = $1",
            session_id,
        )
        return tid

    async def finalize_session(
        self,
        session_id: UUID,
        drive_ref: UUID | None = None,
        cost_usd: float = 0.0,
        commit_message: str | None = None,
    ) -> dict[str, Any]:
        """Compress traces into surface; create immutable snapshot (git commit)."""
        rows = await self.conn.fetch(
            """
            SELECT step_index, step_type, tool_name, input_summary, output_summary, payload
            FROM research_traces
            WHERE session_id = $1
            ORDER BY step_index
            """,
            session_id,
        )
        traces = [dict(r) for r in rows]
        for t in traces:
            if isinstance(t.get("payload"), str):
                t["payload"] = json.loads(t["payload"])

        surface = build_surface_from_traces(traces)
        conclusion = build_conclusion(traces)
        snap_hash = snapshot_hash(traces, surface, conclusion)
        manifest = build_trace_manifest(traces)

        session = await self.conn.fetchrow(
            "SELECT thread_id, version, commit_message FROM research_sessions WHERE id = $1",
            session_id,
        )
        msg = commit_message or (session["commit_message"] if session else "") or surface[:120]

        await self.conn.execute(
            """
            UPDATE research_sessions
            SET status = 'completed',
                surface_summary = $2,
                conclusion = $3::jsonb,
                drive_ref = $4,
                token_surface = $5,
                cost_usd = $6,
                snapshot_hash = $7,
                commit_message = $8,
                completed_at = now()
            WHERE id = $1 AND space_id = $9
            """,
            session_id,
            surface,
            json.dumps(conclusion),
            drive_ref,
            estimate_tokens(surface),
            cost_usd,
            snap_hash,
            msg,
            self.space_id,
        )

        thread_id = session["thread_id"] if session else None
        version = session["version"] if session else 1

        await self.conn.execute(
            """
            INSERT INTO trace_snapshots
                (space_id, session_id, thread_id, version, snapshot_hash,
                 surface_summary, conclusion, trace_manifest, trace_count)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
            ON CONFLICT (session_id) DO UPDATE SET
                snapshot_hash = EXCLUDED.snapshot_hash,
                surface_summary = EXCLUDED.surface_summary,
                conclusion = EXCLUDED.conclusion,
                trace_manifest = EXCLUDED.trace_manifest,
                trace_count = EXCLUDED.trace_count
            """,
            self.space_id,
            session_id,
            thread_id,
            version,
            snap_hash,
            surface,
            json.dumps(conclusion),
            json.dumps(manifest),
            len(traces),
        )

        if thread_id:
            await self.conn.execute(
                """
                UPDATE trace_threads
                SET head_session_id = $2,
                    commit_count = commit_count + 1,
                    updated_at = now()
                WHERE id = $1 AND space_id = $3
                """,
                thread_id,
                session_id,
                self.space_id,
            )

        await self._index_session_chunks(session_id, surface, traces)

        return {
            "session_id": str(session_id),
            "thread_id": str(thread_id) if thread_id else None,
            "version": version,
            "snapshot_hash": snap_hash,
            "commit_message": msg,
            "surface_summary": surface,
            "conclusion": conclusion,
            "token_surface": estimate_tokens(surface),
            "trace_count": len(traces),
        }

    async def _index_session_chunks(
        self,
        session_id: UUID,
        surface: str,
        traces: list[dict],
    ) -> None:
        import hashlib

        chunks: list[tuple[str, UUID | None]] = [(surface, None)]
        for t in traces:
            text = f"{t.get('step_type')}: {t.get('output_summary', '')}"
            if text.strip():
                chunks.append((text, None))

        for i, (content, _) in enumerate(chunks):
            ch = hashlib.sha256(content.encode()).hexdigest()
            await self.conn.execute(
                """
                INSERT INTO research_chunks
                    (space_id, session_id, chunk_index, content, content_hash)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (session_id, chunk_index) DO NOTHING
                """,
                self.space_id,
                session_id,
                i,
                content,
                ch,
            )

    async def expand_trace(
        self,
        session_id: UUID,
        step_types: list[str] | None = None,
        from_step: int | None = None,
        to_step: int | None = None,
    ) -> dict[str, Any]:
        """Reload full reasoning trace — no re-planning, no re-search."""
        session = await self.conn.fetchrow(
            """
            SELECT id, intent_raw, surface_summary, conclusion, drive_ref, trace_count
            FROM research_sessions
            WHERE id = $1 AND space_id = $2
            """,
            session_id,
            self.space_id,
        )
        if not session:
            return {"error": "session_not_found"}

        query = """
            SELECT step_index, step_type, tool_name, input_summary, output_summary,
                   payload, drive_refs, token_estimate, layer_used, created_at
            FROM research_traces
            WHERE session_id = $1
        """
        args: list[Any] = [session_id]
        if step_types:
            query += f" AND step_type = ANY(${len(args) + 1})"
            args.append(step_types)
        if from_step is not None:
            query += f" AND step_index >= ${len(args) + 1}"
            args.append(from_step)
        if to_step is not None:
            query += f" AND step_index <= ${len(args) + 1}"
            args.append(to_step)
        query += " ORDER BY step_index"

        rows = await self.conn.fetch(query, *args)
        steps = []
        for r in rows:
            payload = r["payload"]
            if isinstance(payload, str):
                payload = json.loads(payload)
            steps.append(
                {
                    "step_index": r["step_index"],
                    "step_type": r["step_type"],
                    "tool_name": r["tool_name"],
                    "input_summary": r["input_summary"],
                    "output_summary": r["output_summary"],
                    "payload": payload,
                    "drive_refs": [str(x) for x in (r["drive_refs"] or [])],
                    "layer_used": r["layer_used"],
                }
            )

        return {
            "session_id": str(session_id),
            "intent": session["intent_raw"],
            "surface_summary": session["surface_summary"],
            "conclusion": session["conclusion"],
            "drive_ref": str(session["drive_ref"]) if session["drive_ref"] else None,
            "steps": steps,
            "total_tokens_estimate": sum(s.get("token_estimate", 0) for s in steps),
        }

    async def search_traces(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        """RAG over research chunks — find past reasoning by semantic-ish match (FTS path for v1)."""
        rows = await self.conn.fetch(
            """
            SELECT rc.session_id, rc.content, rs.intent_raw, rs.surface_summary, rs.created_at
            FROM research_chunks rc
            JOIN research_sessions rs ON rs.id = rc.session_id
            WHERE rc.space_id = $1
              AND rs.status = 'completed'
              AND rc.content ILIKE $2
            ORDER BY rs.created_at DESC
            LIMIT $3
            """,
            self.space_id,
            f"%{query}%",
            limit,
        )
        return [
            {
                "session_id": str(r["session_id"]),
                "chunk": r["content"][:500],
                "intent": r["intent_raw"],
                "surface_summary": r["surface_summary"][:300],
                "created_at": r["created_at"].isoformat(),
            }
            for r in rows
        ]

    async def build_context_bundle(
        self,
        intent: str,
        capability: str = "",
        department: str = "",
        token_budget: int = 8192,
        expand_if_ambiguous: bool = False,
    ) -> dict[str, Any]:
        """
        Context OS entry point: surface for prompt, trace refs for expansion.
        Replaces stuffing full chat history into context window.
        """
        hit = await self.resolve(intent, capability, department)
        if hit:
            bundle = {
                "source": "research_memory_reuse",
                "token_budget": token_budget,
                "tokens_used": hit["token_surface"],
                "surface": hit["surface_summary"],
                "conclusion": hit["conclusion"],
                "session_id": hit["session_id"],
                "drive_ref": hit["drive_ref"],
                "expand_available": True,
            }
            return bundle

        # Partial match via chunk search
        related = await self.search_traces(intent, limit=3)
        related_surface = "\n---\n".join(
            f"Past ({r['intent'][:80]}): {r['surface_summary'][:400]}" for r in related
        )
        tokens = estimate_tokens(related_surface)
        return {
            "source": "research_memory_partial",
            "token_budget": token_budget,
            "tokens_used": min(tokens, token_budget // 4),
            "surface": related_surface or "",
            "related_sessions": [r["session_id"] for r in related],
            "expand_available": bool(related),
            "needs_fresh_research": not related,
        }

    async def list_thread_log(self, thread_id: UUID, limit: int = 50) -> list[dict[str, Any]]:
        """Git log — all commits on a thread, newest first."""
        rows = await self.conn.fetch(
            """
            SELECT rs.id, rs.version, rs.commit_message, rs.snapshot_hash, rs.task_type,
                   rs.surface_summary, rs.trace_count, rs.completed_at, rs.parent_session_id,
                   rs.agent_id, rs.cost_usd
            FROM research_sessions rs
            WHERE rs.thread_id = $1 AND rs.space_id = $2 AND rs.status = 'completed'
            ORDER BY rs.version DESC
            LIMIT $3
            """,
            thread_id,
            self.space_id,
            limit,
        )
        return [
            {
                "session_id": str(r["id"]),
                "version": r["version"],
                "commit_message": r["commit_message"],
                "snapshot_hash": r["snapshot_hash"],
                "task_type": r["task_type"],
                "surface_preview": (r["surface_summary"] or "")[:200],
                "trace_count": r["trace_count"],
                "parent_session_id": str(r["parent_session_id"]) if r["parent_session_id"] else None,
                "completed_at": r["completed_at"].isoformat() if r["completed_at"] else None,
                "cost_usd": r["cost_usd"],
            }
            for r in rows
        ]

    async def checkout(self, session_id: UUID) -> dict[str, Any]:
        """View a past commit — full trace + snapshot metadata (git checkout)."""
        session = await self.conn.fetchrow(
            """
            SELECT rs.*, ts.trace_manifest, ts.snapshot_hash AS snap_hash
            FROM research_sessions rs
            LEFT JOIN trace_snapshots ts ON ts.session_id = rs.id
            WHERE rs.id = $1 AND rs.space_id = $2
            """,
            session_id,
            self.space_id,
        )
        if not session:
            return {"error": "commit_not_found"}

        expanded = await self.expand_trace(session_id)
        return {
            "commit": {
                "session_id": str(session_id),
                "thread_id": str(session["thread_id"]) if session["thread_id"] else None,
                "version": session["version"],
                "commit_message": session["commit_message"],
                "snapshot_hash": session["snapshot_hash"] or session["snap_hash"],
                "task_type": session["task_type"],
                "parent_session_id": str(session["parent_session_id"]) if session["parent_session_id"] else None,
                "completed_at": session["completed_at"].isoformat() if session["completed_at"] else None,
            },
            "snapshot_manifest": session["trace_manifest"] if session["trace_manifest"] else [],
            "trace": expanded,
        }

    async def diff_sessions(self, left_id: UUID, right_id: UUID) -> dict[str, Any]:
        """Git diff between two commits."""
        left_meta = await self._session_meta(left_id)
        right_meta = await self._session_meta(right_id)
        if not left_meta or not right_meta:
            return {"error": "commit_not_found"}

        left_exp = await self.expand_trace(left_id)
        right_exp = await self.expand_trace(right_id)
        return diff_commits(
            left_exp.get("steps", []),
            right_exp.get("steps", []),
            left_meta,
            right_meta,
        )

    async def _session_meta(self, session_id: UUID) -> dict[str, Any] | None:
        row = await self.conn.fetchrow(
            """
            SELECT id, version, commit_message, snapshot_hash, surface_summary, conclusion
            FROM research_sessions WHERE id = $1 AND space_id = $2
            """,
            session_id,
            self.space_id,
        )
        if not row:
            return None
        concl = row["conclusion"]
        if isinstance(concl, str):
            concl = json.loads(concl or "{}")
        return {
            "session_id": str(row["id"]),
            "version": row["version"],
            "commit_message": row["commit_message"],
            "snapshot_hash": row["snapshot_hash"],
            "surface_summary": row["surface_summary"],
            "conclusion": concl,
        }

    async def list_threads(self, capability: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
        if capability:
            rows = await self.conn.fetch(
                """
                SELECT * FROM trace_threads
                WHERE space_id = $1 AND capability = $2
                ORDER BY updated_at DESC LIMIT $3
                """,
                self.space_id,
                capability,
                limit,
            )
        else:
            rows = await self.conn.fetch(
                """
                SELECT * FROM trace_threads
                WHERE space_id = $1
                ORDER BY updated_at DESC LIMIT $2
                """,
                self.space_id,
                limit,
            )
        return [self._thread_row(r) for r in rows]
