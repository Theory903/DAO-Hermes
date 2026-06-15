# DAO OS Desktop

Native Electron shell for **DAO OS**, forked from `apps/desktop` (Hermes desktop). The Python sidecar runs `hermes dashboard` with the **DAO company layer** mounted at `/api/v1` when `DAO_API_ENABLED=1`.

**DAO OS** = company operating system (Spaces, Drive, Jarvis, Research Memory). **Hermes** = agent execution underneath (tools, MCP, cron, sessions). See [../../README.md](../../README.md) and [../../DAO/README.md](../../DAO/README.md).

Product docs: [../../../docs/DESKTOP-APP-PLAN.md](../../../docs/DESKTOP-APP-PLAN.md) · [../../../docs/DEVELOPMENT.md](../../../docs/DEVELOPMENT.md)

## Prerequisites

- Node.js 20+ (see `package.json` engines)
- Hermes/DAO Python env from repo root (`hermes-agent/`): `uv sync --extra DAO`
- Postgres + env for DAO API when exercising `/api/v1` (see `docs/DESKTOP-APP-PLAN.md`)

## Install dependencies

From `hermes-agent/` (monorepo root for npm workspaces). If your prompt already shows `hermes-agent`, stay in that directory — do not run `cd hermes-agent` again.

```bash
npm ci
npm run install:DAO-desktop
```

## Development

**One command (from monorepo root):**

```bash
./scripts/dev-desktop.sh
```

Or from `hermes-agent/`:

```bash
npm run dev:DAO-desktop
```

This starts the Vite renderer on `http://127.0.0.1:5174` and launches Electron. The main process spawns (or attaches to) the Python sidecar with:

- `HERMES_DESKTOP=1`
- `DAO_API_ENABLED=1`

Optional overrides (same as Hermes desktop):

- `HERMES_DESKTOP_HERMES_ROOT` — path to `hermes-agent` checkout
- `HERMES_DESKTOP_PYTHON` — Python binary for the sidecar
- `HERMES_DESKTOP_REMOTE_URL` — reuse an API already on `:9119` (set by `dev-desktop.sh`)
- `DATABASE_URL`, `JWT_SECRET` — required when DAO API is enabled

**User flow:** dev-login → Space picker → `#/space/{slug}` company shells, or `#/` Hermes chat (WS via `POST /spaces/{id}/ws/ticket`, `prompt.submit` on gateway).

## Production build

```bash
cd hermes-agent
npm run build:DAO-desktop
```

Packaged artifacts (from `apps/DAO-desktop/`):

```bash
npm run dist:mac    # or dist:win, dist:linux
```

## Typecheck

```bash
cd hermes-agent/apps/DAO-desktop
npm run typecheck
```

## Identity

| Field | Value |
|-------|--------|
| Product name | DAO OS |
| App ID | `com.DAO.os` |
| Executable | `DAO` (platform-specific) |

Hermes desktop remains at `apps/desktop/` unchanged — reference only for DAO product work.
