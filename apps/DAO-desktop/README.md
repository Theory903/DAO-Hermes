# DAO OS Desktop

Native Electron shell for **DAO OS**, forked from `apps/desktop` (Hermes desktop). The Python sidecar runs `hermes dashboard` with company-layer APIs enabled.

## Prerequisites

- Node.js 20+ (see `package.json` engines)
- Hermes/DAO Python env from repo root (`hermes-agent/`): `uv sync` or existing venv
- Postgres + env for DAO API when exercising `/api/v1` (see `docs/DESKTOP-APP-PLAN.md`)

## Install dependencies

From `hermes-agent/` (monorepo root for npm workspaces). If your prompt already shows `hermes-agent`, stay in that directory — do not run `cd hermes-agent` again.

```bash
npm ci
npm run install:DAO-desktop
```

## Development

```bash
npm run dev:DAO-desktop
```

From repo root you can instead run `./scripts/dev-desktop.sh` (Postgres + migrate + desktop).

This starts the Vite renderer on `http://127.0.0.1:5174` and launches Electron. The main process spawns the Python sidecar with:

- `HERMES_DESKTOP=1`
- `DAO_API_ENABLED=1`

Optional overrides (same as Hermes desktop):

- `HERMES_DESKTOP_HERMES_ROOT` — path to `hermes-agent` checkout
- `HERMES_DESKTOP_PYTHON` — Python binary for the sidecar
- `DATABASE_URL`, `JWT_SECRET` — required when DAO API is enabled

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

Hermes desktop remains at `apps/desktop/` unchanged.
