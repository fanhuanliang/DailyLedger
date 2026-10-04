# DailyLedger — Agent Rules

Rules for any AI agent (Claude Code or otherwise) working in this repository. Read this file fully before every task. These rules apply to every stage of implementation.

## 1. Sources of truth

| Document | Role |
| --- | --- |
| `doc/spec.md` | **Authoritative** v1 requirements: behavior, calculations, data model, API contract, acceptance criteria |
| `doc/plan.md` | Product intent and the implementation sequence (stages) |
| `AGENTS.md` | How to build: process, conventions, guardrails |

- If `plan.md` and `spec.md` disagree, **`spec.md` wins**. Referenced categories cannot be deleted; archive them or reassign all references before considering deletion.
- Preserve agreed product behavior. Resolve routine implementation details using the spec and engineering judgment; ask the user only when a product decision or missing external information blocks progress.
- Spec §9 lists decisions left open for the build (VM ports, backup destination, chart library, final category names). When one is resolved, record it in `doc/decisions.md` (date, decision, reason) and tell the user.
- Re-read the relevant spec section before implementing a feature. Don't work from memory.

## 2. Staged workflow

The build follows the six stages in `doc/plan.md` → "Implementation sequence":

1. Foundation: frontend, API, database, responsive tab layout, Docker config
2. Core ledger: accounts, opening balances, categories, Records, manual entry, transfers, refunds, filters
3. MCP imports: shared API access, preview, duplicate detection, approved batch commit, retry protection
4. Planning: annual budgets, savings goals, recurring reminders with effective-date versions
5. Insights: dashboard, charts, reports, year comparison, CSV export
6. VM rollout: ports, home-network access, phone/desktop checks, backups, connect MCP bridge

Rules:
- When the user explicitly limits work to stage N, do only that stage. When the user authorizes implementing the app or multiple stages, continue through that scope without requesting permission again at every stage. Report missing prerequisites and resolve those within the authorized scope.
- Before starting a stage, give a short checklist of what you will build, mapped to spec sections.
- Finish each stage with what was built, actual checks and their passed/failed/not-tested status, acceptance criteria covered, review disposition, commit IDs, and remaining issues. Stop only at the end of the authorized scope or a genuine blocker.
- Track progress in `doc/progress.md`: one section per stage with status and its checklist.
- The user authorizes Git initialization and a commit for every completed, independently reviewable implementation step. Commit only after independent review and applicable checks pass. Never commit secrets, original financial files, databases, backups, or unrelated changes. Push, remote creation, and history rewriting still require explicit user instruction.

## 3. Stack and layout

Use the documented stack and layout unless the spec requires something different.

```
DailyLedger/
├── AGENTS.md / CLAUDE.md
├── doc/                 spec.md, plan.md, decisions.md, progress.md
├── backend/             Node 20 + TypeScript, Express 5, better-sqlite3, Jest + supertest
│   └── src/  app.ts, index.ts, db/ (connection, migrations/), routes/, services/, middleware/, types/
├── frontend/            React 19 + Vite + TypeScript, Tailwind, React Router, Vitest + Testing Library
│   └── src/  api/, components/, hooks/, pages/ (one per tab), types/, lib/ (money/date helpers)
├── mcp-server/          stdio MCP bridge, TypeScript; talks to the API only
├── docker-compose.yml   reverse proxy serving the frontend and /api on one origin
├── .env.example         every config key, no real values
└── README.md            setup, run, test, backup/restore
```

- Business logic belongs in `backend/src/services/`. Routes only parse input, call a service and shape the response.
- Keep calculations (balances, net expenses, budgets, reminders) in pure functions that can be unit-tested without HTTP.
- TypeScript `strict: true` everywhere. No `any` without a comment explaining why.
- Before adding a dependency, check whether the stack above already covers the need. Mention new dependencies in the stage summary.

## 4. Money and dates (non-negotiable)

- **All money is integer cents** in the DB, the API, the services and MCP. No floats anywhere in money paths. Convert to and from `"12.34"` only at the UI edge, with a tested helper that parses strings (never `parseFloat(x) * 100`).
- Validate cent inputs and computed cent results with Number.isSafeInteger, or exact integer arithmetic with explicit API range checks. Percentages/charts may use decimals; monetary percentage adjustments use exact arithmetic and half-up rounding. Transaction amounts are **positive**; `type` sets the direction. Reject zero, negative, non-finite and non-integer amounts. Budgets may be 0. Goal targets must be > 0.
- Account balance sign (spec §3):
  - Ordinary accounts: income/refund add, expense subtracts.
  - Transfers subtract from the source and add to the destination, in one row with `destination_account_id`.
  - Credit cards are signed: debt is negative. A purchase decreases the balance; a payment or refund increases it. The UI shows a negative balance as "amount owed" and a positive one as "card credit".
- Balance at date D = opening balance + movements from `opening_date` through D, inclusive. If D is before `opening_date` → **Not available**, never 0. Reject transactions dated before an affected account's opening date.
- Period totals: net expenses = expenses − refunds; income excludes refunds and transfers; money left over = income − net expenses. Transfers, opening balances and goal edits never count.
- Category % is only shown when total net expenses > 0; otherwise "unavailable".
- Percentage changes on recurring amounts round to the nearest cent, half up ($5,000 + 3% = $5,150.00).
- Dates are `YYYY-MM-DD` strings (calendar dates, with no time or timezone). Timestamps are UTC ISO strings. "Today" and the current period come from the configured household timezone (default `America/Los_Angeles`), never the server's local time.
- Monthly/yearly recurrences on a missing day (31st, Feb 29) fall on the month's last day. Year comparisons clamp Feb 29 → Feb 28.
- Never store derived totals. Reports and balances are always computed from ledger rows.

## 5. Data and persistence

- SQLite via better-sqlite3 with `PRAGMA foreign_keys = ON` and WAL mode. Schema changes only through numbered migration files. Never edit a migration that has already run.
- UUID ids. Every table has `created_at` and `updated_at`. Mutable records have an integer `revision`.
- Preserve the entities, meanings, nullability, and constraints in spec §4. Supporting indexes, fields, and tables are allowed when necessary; document them in decisions.md and review them. Enforce business constraints in the schema where possible and in the service layer.
- No `ON DELETE CASCADE` on financial history. Archive (`archived_at`) instead of deleting accounts and referenced categories.
- Multi-row writes (transfers, reminder confirmations, import commits, budget copies) run inside one DB transaction.
- Never persist original documents, document text, OCR output or images. Import previews hold normalized ledger fields, notes and decisions only, and expire after 24 h.

## 6. API contract

- Prefix `/api/v1`. Success: `{ "data": ... }`. Failure: `{ "error": { "code", "message", "fields?" } }`.
- Status codes: 400 for a malformed request, 404 for a missing record, 409 for a revision conflict or idempotency-key reuse, 422 for a business-rule violation.
- Lists are paginated: default 50, max 200, and include pagination metadata.
- Edits and deletes require `expectedRevision`. A stale revision returns 409 and is never silently overwritten.
- Validate every input on the server, whatever the client. The frontend validates too, but only for usability.
- CSV export escapes formula-leading cells (`=`, `+`, `-`, `@`, tab, CR).
- Implement the specified product API. Supporting endpoints such as CSRF initialization are allowed when needed for specified behavior; document and review them. New product features require user authorization.

## 7. Security

- No user login (by design), but:
  - The MCP bridge authenticates with a scoped bearer token from env config.
  - Browser writes need a same-origin check and a CSRF token.
  - No wildcard CORS.
- Logs must never contain tokens, request bodies with financial data, or amounts. Log method, path, status and duration only.
- Secrets, DB path, port and timezone come from env vars. `.env.example` documents them. `.gitignore` covers `.env`, `*.db`, `*.db-*`, `backups/`.
- No public port forwarding. Restrict exposure to the home network.

## 8. MCP bridge

- A stdio process that calls the HTTP API. **It never opens SQLite directly.**
- Imports always go `preview_import` → show the user the selected rows and totals → `commit_import` with an idempotency key. Never bypass review with `create_transaction` for imported data.
- Tool descriptions state required fields and side effects. Write tools say clearly that they change the ledger.
- Duplicate detection only flags candidates. It never deletes or auto-skips rows.
- When using the MCP tools in chat, always get explicit user approval of the exact preview before calling `commit_import`.

## 9. Testing

- Backend: Jest + supertest against a temporary or in-memory SQLite database. Frontend: Vitest + Testing Library.
- Every calculation rule in §4 gets unit tests, including edge cases: credit card sign, before-opening-date, refund > expense, Feb 29, month-end recurrence, half-up rounding.
- Track AC1-AC15 with meaningful automated tests where suitable and recorded manual or deployment checks where appropriate. Name automated acceptance tests with the relevant criterion. Do not substitute mocked tests for real network, responsive UI, or backup/restore verification.
- Run the full test suite and type-check (`tsc --noEmit`) before declaring a stage done. Report failures honestly and never skip or delete a failing test to make a run green.
- Check the UI at phone width (~375 px) and at desktop width.

## 10. UI

- Tabs: Dashboard, Records, Accounts, Categories, Budgets, Goals, Reminders, Reports. Tabs may collapse to a menu on mobile. Show an "Add transaction" action that is always visible.
- Desktop: readable tables. Phone: compact cards or a readable scrolling table.
- Empty states show helpful prompts and zero totals. Never show fake sample financial data.
- Before a delete or an edit that changes totals, say so in the confirmation text.
- Display money as `$1,234.56` (negative as `-$1,234.56`, or "amount owed" for cards).

## 11. Out of scope for v1

Bank sync, reconciliation, file upload/OCR in the app, notifications outside the app, user accounts, multiple currencies, split-category transactions, multiple active goals per savings account. Don't build these or add hooks for them.
## 12. Codex and Claude Code teamwork

The owner authorizes Codex and Claude Code to communicate about DailyLedger, implement within the requested scope, review each other's work, and commit completed steps. This does not authorize access to unrelated projects, financial imports without review, remote publishing, or production deployment beyond the requested scope.

Default roles: Codex is coder and coordinator; Claude Code is independent reviewer. Roles may swap for a documented step. Exactly one agent owns code edits at a time. The reviewer reads the diff and relevant files without editing until the coder explicitly hands over ownership. Do not run concurrent writers in the same checkout.

For every independently reviewable step:
1. Record scope, coder, reviewer, starting commit (or initial working state), owned files, and expected checks in doc/progress.md.
2. Coder implements the step and runs appropriate tests, type checks, and builds. Use behavior and edge-case tests for substantive logic; do not add implementation-mirroring tests for trivial documentation changes.
3. Reviewer independently inspects the exact diff, relevant spec requirements, failure paths, data integrity, money/date arithmetic, security, and test coverage. Return findings with severity, file/line, impact, and a concrete fix, or explicitly state no actionable findings. State checks actually run separately from checks reported by the coder.
4. Coder fixes findings; reviewer reviews the changed diff. Repeat until there are no unresolved known defects in the step and required checks pass. Record any limitation or unavailable verification; never call untested work verified or promise an absence of all bugs.
5. Stage only the reviewed files, inspect the staged diff, commit with a descriptive message, and record the commit and evidence in progress.md. A later documentation bookkeeping commit may record the final hash without creating a self-referential hash loop.
6. Continue to the next authorized step. Do not commit unfinished or knowingly broken implementation as a completed step. Do not delete or weaken a failing test merely to pass.

Use the installed Claude Code CLI for direct prompts and replies. Reuse the dedicated collaboration session ID for context; never resume an unrelated or live desktop session implicitly. Read-only reviews must use only read tools and retain permission checks. Do not use bypassPermissions or dangerously-skip-permissions. Any edit-capable handoff requires scoped tool permissions and explicit file ownership. If authentication, quota, or permissions prevent independent review, record the blocker and do not claim review passed.

Keep doc/progress.md and doc/decisions.md current. Save durable reviewer findings, resolutions, and the collaboration session ID in doc/collaboration.md so either agent can resume. Session IDs are context identifiers, never credentials. Provide only project-relevant context to the other agent; do not send secrets or original financial documents.

Quality target: all agreed v1 requirements implemented, no unresolved known defects, relevant automated and manual checks passed, and remaining limitations disclosed. Final rollout requires functional desktop/mobile verification, consistent reports, import retry safety, history-preserving recurring updates, and a real backup/restore check. Do not represent a polished UI or passing unit tests alone as a finished app.
