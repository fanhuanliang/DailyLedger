# DailyLedger

Shared household finance app for the home network. Requirements: doc/spec.md. Workflow: AGENTS.md and CLAUDE.md.

## Development

Use Node 24 LTS and pnpm 11.19.0 (`npm install --global pnpm@11.19.0` on your development machine). Run `pnpm install --frozen-lockfile` from this folder. In separate terminals run `pnpm --filter @dailyledger/backend dev` and `pnpm --filter @dailyledger/frontend dev`. Open http://127.0.0.1:5173. The frontend proxies /api to the backend at port 5010.

Run `pnpm test`, `pnpm typecheck`, and `pnpm build` from the repository root. Tests use isolated in-memory or temporary SQLite databases, never your household database.

The backend reads environment variables (or a root .env when started from root); per-package development scripts run inside their package, so export variables in the terminal or provide backend/.env. Copy .env.example and configure DB_PATH, HOUSEHOLD_TIMEZONE, HOST and PORT as needed. Changing backend PORT also requires updating the Vite proxy.

Browser writes (POST/PATCH/DELETE under `/api/v1`) require a same-origin request and a CSRF token. The frontend fetches `GET /api/v1/csrf-token` once per session (a same-origin check sets an HttpOnly session cookie) and sends the token back as an `X-CSRF-Token` header on writes; there is no app login. Set `APP_ORIGIN` to the exact origin the browser loads the app from (defaults to the Vite dev server). The MCP bridge instead authenticates with an `Authorization: Bearer <MCP_TOKEN>` header and skips the browser CSRF/session flow entirely; set `MCP_TOKEN` before connecting MCP (Stage 3). `GET /api/v1/settings` is a small supporting endpoint (household timezone/currency only, no financial data) the frontend uses to default new records to today's date in the household timezone.

## Docker

Copy .env.example to .env, then run `docker compose up --build -d`. Default app address is http://127.0.0.1:8095. The API is internal to the Compose network and is accessed through /api at the same origin. A named volume preserves the database. Do not run `docker compose down -v` unless intentionally deleting data.

For VM home-network use, select an available APP_PORT, set BIND_IP to the VM's home-network IP, set APP_ORIGIN to match that address, and restrict access in the VM/network firewall. No public forwarding. Actual ports and firewall configuration are verified during VM rollout. Compose derives a default APP_ORIGIN from BIND_IP/APP_PORT if not set explicitly; override it if a reverse proxy presents a different origin.

## Current implementation

Stage 1 foundation: navigation shell, database/settings migration, readiness and JSON 404 API, same-origin proxy, and Docker configuration.

Stage 2 core ledger: accounts (opening balance/date, archive, credit-card signed balances shown as amount owed/card credit), categories (income/expense kind, unique active name, rename, archive), and transactions (manual income/expense/refund/transfer entry and edit, revision-conflict (409) protection, before-opening-date and archived-account rejection, filtering by date/text/category/account/type, pagination, newest-first sort). Reviewed later steps add approved imports, annual budgets, savings goals and recurring reminders. Dashboard and Reports use real ledger calculations; see verification status in doc/progress.md before treating the build as deployment-ready.

Docker build/run verification and real backup/restore remain pending. Backup must use SQLite's consistent backup API; do not copy a live WAL database file alone. A runnable backup/restore procedure will be added and tested before rollout. Original statements and receipts must not be stored by the app.

HOUSEHOLD_TIMEZONE seeds a new database only; subsequent starts preserve its saved timezone and revision. Changes to an existing household timezone need an explicit revision-aware settings change, not a server restart. A settings editor is not yet implemented.

Stage3 imports/MCP: normalized immutable previews, duplicate hints, approved atomic commits and idempotent retries; shared period summary endpoint. Bridge setup and review rules: mcp-server/README.md. Real production client connection remains pending VM rollout.

## Planning and reports

Annual budgets distinguish unset limits from zero and keep overall/category limits independent. Savings goals use current savings balances, with one active goal per account. Recurring reminders require confirmation before creating transactions; effective-date amount/schedule versions preserve financial history.

Dashboard and Reports default to the household current month, with calendar-year and custom-date selection. Reports include charts and detail for net category spending, monthly trends, ending account balances, annual budgets, current goals and due reminders. Negative refunds remain visible. Annual budgets always show their full year; goals/reminders show current status, separately labeled from historical periods. Previous-year comparison defaults to matched year-to-date and offers selected-period/full-year modes, including leap-day clamping and incomplete-current-year labels.

Export CSV from Records to preserve its date/text/type/category/account filters across all pages, or from Reports for the selected period. Text fields escape spreadsheet formulas; cents use exact decimal formatting. Export files contain financial information and should remain local/out of Git.
