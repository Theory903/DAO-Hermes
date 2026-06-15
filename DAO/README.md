# DAO — Company layer

**DAO OS** is an AI-native company operating system. **Hermes** is the execution engine underneath — agent loop, tools, MCP, cron, gateway, and session storage. This package (`DAO/`) is the company layer mounted on the Hermes FastAPI app.

Product docs live in the monorepo: [docs/PRODUCT-OVERVIEW.md](../../docs/PRODUCT-OVERVIEW.md) · [docs/PRD.md](../../docs/PRD.md) · [ARCHITECTURE.md](../../ARCHITECTURE.md)

---

## How Hermes and DAO fit together

```text
┌─────────────────────────────────────────────────────────────┐
│  Clients: DAO-desktop · DAO-web · messaging bridges         │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  DAO/  — Spaces, Drive, Jarvis, Research Memory, HITL, …   │
│          REST /api/v1  ·  WS tickets  ·  RLS middleware    │
└───────────────────────────┬─────────────────────────────────┘
                            │ mount_DAO() when DAO_API_ENABLED=1
┌───────────────────────────▼─────────────────────────────────┐
│  Hermes — agent loop, delegate, tools, MCP, cron, gateway  │
│           hermes_cli/web_server.py  ·  tui_gateway/ws.py   │
└─────────────────────────────────────────────────────────────┘
```

| Layer | Responsibility | You talk to… |
|-------|----------------|--------------|
| **DAO** | Tenancy, knowledge, org chart, governance, company UI APIs | Board → **AI Lead (Jarvis)** |
| **Hermes** | Tool execution, subagents, skills, memory, channels | Workers via `delegate_tool` |

**Invariant:** Every authenticated request sets Postgres RLS context and `set_hermes_home_override(space_id)` so sessions, skills, and SQLite state stay inside one **Space**.

---

## Module map

| Path | Purpose |
|------|---------|
| `spaces/` | Space CRUD, provisioning, members, WS tickets |
| `auth/` | OAuth, dev login, JWT middleware |
| `drive/` | Space Drive — upload, search, **preflight**, **writeback** |
| `research_memory/` | Intent dedup, traces, **Trace Git** (log / checkout / diff) |
| `org/` | Departments, agents, org chart |
| `jarvis/` | AI Lead supervisor routes and runtime |
| `workers/` | Department worker execution helpers |
| `comms/` | Inter-dept bus, Command Center events |
| `hitl/` | Human-in-the-loop approval gates |
| `canvas/` | Blank Canvas workflow compiler |
| `council/` | Council of LLMs promotion gate |
| `brain/` | Company Brain / Dream Cycle entities |
| `skills/` | Department skills inheritance |
| `tools/` | Platform tools + ACL |
| `enclave/` | Space Enclave encryption (Enterprise) |
| `wiki/` | Workflow wiki compilation |
| `hermes/` | Bridge routes into Hermes runtime config |
| `middleware/` | Space context, rate limits, error envelope |
| `app.py` | `mount_DAO()` — attaches routers to FastAPI |

Build order (dependencies): `spaces` → `research_memory` → `drive` → `org`/`jarvis` → `skills`/`tools` → `comms` → `hitl` → `canvas` → `council` → `brain` → `enclave`.

Feature status: [docs/FEATURES.md](../../docs/FEATURES.md)

---

## Enable the company layer

```bash
export DAO_API_ENABLED=1
export DATABASE_URL=postgresql://DAO:DAO@localhost:5433/DAO
export JWT_SECRET=dev-change-me
export DAO_DATA_ROOT=./data/spaces

uv sync --extra DAO
uv run DAO api --reload --port 9119
```

Health: `curl http://127.0.0.1:9119/api/v1/health`  
Hermes liveness: `curl http://127.0.0.1:9119/api/status`

`mount_DAO()` in `app.py` is called from `hermes_cli/web_server.py` when `DAO_API_ENABLED=1`.

---

## Never-do-twice (Worker task contract)

Before a Worker runs expensive tools:

```python
from DAO.drive.preflight import check_reuse

hits = await check_reuse(space_id, intent, department)
# Research Memory resolve first, then Drive search
```

After tool completion, outputs **writeback** to Drive with `produced_by_agent_id` and `produced_by_dept`. Reasoning is captured via **Trace Git** (`research_memory/`).

Workers do not DM Workers — cross-department work goes through the **Inter-Dept Bus** (Lead → Lead only).

---

## Clients in this fork

| Client | Path | Notes |
|--------|------|-------|
| **DAO OS Desktop** (native) | `apps/DAO-desktop/` | Electron + Python sidecar — **primary product shell** |
| **DAO-web** (browser admin) | `../../apps/DAO-web/` | Next.js 15 + VOID UI |
| Hermes desktop (upstream) | `apps/desktop/` | Reference only; do not extend for DAO product |
| Hermes web (legacy) | `web/` | Reference / embed only |

See [docs/DESKTOP-APP-PLAN.md](../../docs/DESKTOP-APP-PLAN.md).

---

## CLI entry points

| Command | Purpose |
|---------|---------|
| `DAO api` | FastAPI + Hermes gateway + optional `/api/v1` |
| `DAO worker` | Dream cycle, briefings, cron inject |
| `hermes` / `hermes web` | Hermes-only (company layer off unless `DAO_API_ENABLED=1`) |

Defined in `pyproject.toml` → `DAO_cli/`.

---

## Further reading

- [hermes-agent/README.md](../README.md) — fork overview + Hermes capabilities
- [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md) — local dev, desktop, migrations
- [docs/API.md](../../docs/API.md) — REST, SSE, WebSocket
- [docs/RESEARCH-MEMORY.md](../../docs/RESEARCH-MEMORY.md) — Trace Git spec
- [AGENTS.md](../../AGENTS.md) — rules for AI coding agents in this repo
