# Decisions

## 2026-10-03 - Collaboration and Git
Codex codes and coordinates by default; Claude Code independently reviews. Only one code writer at a time. Commit each reviewed and verified step locally; no push is authorized. The user requested this workflow.

## Open implementation decisions
- VM OS/address and available ports.
- Backup destination and retention.
- Chart library and final seeded categories.
- Verify runtime/dependency support before scaffolding; do not blindly inherit old versions from reference application.

## 2026-10-03 - Node 24 LTS (owner decision)
Owner chose Node 24 LTS after disclosure that inherited Node 20 is EOL. Use Node 24 in local development and Docker; shared instructions updated. Source: https://nodejs.org/en/about/previous-releases.

## 2026-10-03 - Workspace tooling
Use pnpm workspaces and a committed lockfile: pnpm is bundled here while npm is not on PATH. The application stack stays React/Express/SQLite and its specified test libraries. Use Tailwind 3 for the existing configuration style. Native SQLite builds require Node-compatible binaries or a compiler toolchain.

## 2026-10-03 - Stage 2 write security (CSRF/session/MCP)
Browser writes use a synchronizer-token pattern, not double-submit: the server issues a random per-session CSRF token via `GET /api/v1/csrf-token`, keyed to an HttpOnly, SameSite=Lax session cookie (in-memory session map, no persistence). The frontend caches the token and sends it back as `X-CSRF-Token` on POST/PATCH/DELETE. A same-origin check compares the `Origin` header (when present) against a configured `APP_ORIGIN`; mismatches are rejected for all `/api/v1` routes except `/health`. The MCP bridge instead authenticates with `Authorization: Bearer <MCP_TOKEN>` and bypasses the CSRF/session flow, since it is not a browser. Reason: spec §7 requires a same-origin check plus a browser-session CSRF token without wildcard CORS, and a separate scoped MCP credential; no cors middleware is used, so there is no Access-Control-Allow-Origin header for any route. `COOKIE_SECURE` (default false) controls the cookie's Secure flag, since the home-network deployment is plain HTTP by default.

## 2026-10-03 - Settings read endpoint and migration 002
Added `GET /api/v1/settings` (read-only; household_timezone and currency only) as a supporting endpoint so the frontend can default new-record dates to "today" in the household timezone rather than the browser's local time, per spec §4's timezone rule. Added migration `002-ledger.ts` (accounts, categories, transactions tables, matching spec §4 fields/constraints) layered on top of the existing `001-settings.ts`, which is unedited.

## 2026-10-03 - Owner decision on Stage 2 TDD deviation
Owner chose: "Retain, fix, and record deviation (recommended)" in response to Codex's disclosure that missing-module and test-fixture failures do not establish meaningful Red under AGENTS.md section 9. Retain Stage 2 implementation, correct the historical claims, require genuine failing regression tests before review fixes, and strict TDD for remaining application behavior. This decision does not waive defects, verification, or independent review.

## October 4 - Bounded browser sessions
Use a 24-hour absolute session lifetime and a maximum of 1000 per-process sessions; evict the oldest at capacity, and recover browser writes once only after pre-mutation CSRF_REQUIRED403. Do not retry network errors or other rejection codes. Token responses use no-store; concurrent initialization shares one pending request. These are security implementation details; household financial data is never stored in sessions.

## October4 - Ledger guards and starter categories
Migration003 adds SQLite insert/update triggers for safe integer cents without rebuilding financial tables. Seed Housing/Groceries/Utilities/Transportation/Dining/Healthcare/Shopping/Entertainment and Salary/Other income once, preserving any matching archived categories; later restarts never recreate renamed seeds. Existing migrations remain unchanged.
