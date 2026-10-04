# DailyLedger

Shared household finance app for the home network. Requirements: doc/spec.md. Workflow: AGENTS.md and CLAUDE.md.

## Development

Use Node 24 LTS and pnpm 11.19.0 (`npm install --global pnpm@11.19.0` on your development machine). Run `pnpm install --frozen-lockfile` from this folder. In separate terminals run `pnpm --filter @dailyledger/backend dev` and `pnpm --filter @dailyledger/frontend dev`. Open http://127.0.0.1:5173. The frontend proxies /api to the backend at port 5010.

Run `pnpm test`, `pnpm typecheck`, and `pnpm build` from the repository root. Tests use isolated in-memory or temporary SQLite databases, never your household database.

The backend reads environment variables (or a root .env when started from root); per-package development scripts run inside their package, so export variables in the terminal or provide backend/.env. Copy .env.example and configure DB_PATH, HOUSEHOLD_TIMEZONE, HOST and PORT as needed. Changing backend PORT also requires updating the Vite proxy.

## Docker

Copy .env.example to .env, then run `docker compose up --build -d`. Default app address is http://127.0.0.1:8095. The API is internal to the Compose network and is accessed through /api at the same origin. A named volume preserves the database. Do not run `docker compose down -v` unless intentionally deleting data.

For VM home-network use, select an available APP_PORT, set BIND_IP to the VM's home-network IP, and restrict access in the VM/network firewall. No public forwarding. Actual ports and firewall configuration are verified during VM rollout.

## Current implementation

Stage 1 foundation: navigation and empty states, database/settings migration, readiness and JSON 404 API, same-origin proxy, and Docker configuration. Record entry, account management, reports and MCP are not implemented yet; the Add transaction link opens the Records sheet only. Zero cards describe an empty preview, not persisted report totals.

Docker build/run verification and real backup/restore remain pending. Backup must use SQLite's consistent backup API; do not copy a live WAL database file alone. A runnable backup/restore procedure will be added and tested before rollout. Original statements and receipts must not be stored by the app.

HOUSEHOLD_TIMEZONE seeds a new database only; subsequent starts preserve its saved timezone and revision. Changes to an existing household timezone need an explicit revision-aware settings change, not a server restart. A settings editor is not yet implemented.
