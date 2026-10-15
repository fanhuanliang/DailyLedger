# DailyLedger v1 specification

Status: Ready for implementation planning. This document translates doc/plan.md into implementable requirements. Technical defaults below may be adjusted without changing the agreed product behavior.

## 1. Product boundary

One household, one shared ledger, USD only, no browser login. Run on a VM on a home server, accessible only on the home network through desktop and mobile browsers. Users enter records in the app; the assistant processes supplied documents in chat and writes reviewed data through MCP. The server stores no original receipts, statements, images, or PDFs.

Include accounts, categories, records, annual budgets, savings goals, in-app recurring reminders, dashboard, reports, CSV export, and MCP integration. Exclude bank synchronization, reconciliation, file uploads/OCR in the app, notifications outside the app, separate users, and split-category purchases.

## 2. Screens and interactions

Navigation tabs: Dashboard, Records, Accounts, Categories, Budgets, Goals, Reminders, Reports. Tabs may collapse to a mobile menu. Show a persistent Add transaction action.

### Dashboard

Default period: current month in the configured household timezone. Selector supports month, calendar year, and custom inclusive date range. Display income, net expenses, and money left over; category spending chart and detail table; monthly income/expense trend chart; account balances; annual budget progress; goal progress; and due reminders. No-data states display useful prompts and zero totals rather than sample financial data.

Annual budget cards always identify their calendar year. For custom ranges crossing years, show separate annual budget sections. Historical account balances use the selected end date. Historical goal progress is excluded in v1; goal cards explicitly show current progress.

### Records

One paginated table containing all transaction types. Columns: date, description, type, amount, category, account, and optional notes. Transfers display source and destination accounts. Default sort: newest date first, then creation time. Filters: date range, text, category, account, type. Mobile records expose the same information in compact cards or a readable scrollable table.

Entry form: date defaults to today; description, positive amount, type, and account required. Income requires an income category. Expense and refund require an expense category. Transfers require two distinct accounts and no category. Notes are optional. Support edit and confirmed deletion; deletion removes the record from calculations. Clearly describe that editing or deleting records changes calculated totals.

### Accounts and categories

Account types: checking, savings, cash, credit_card. Set opening date and opening balance; credit-card opening entry is labeled amount owed. Archive accounts rather than removing financial history. Archived accounts remain in reports and cannot receive new entries.

Categories have income or expense kind, editable name, and active status. Seed expense categories from the plan and income categories Salary and Other income. Prevent deletion when referenced; allow archive and rename. Inactive categories remain visible on historical records.

### Budgets

Select a calendar year. Edit optional overall spending limit and optional limits for expense categories. Show budget, net spending, and remaining; negative remaining indicates overspending. Unset limits display Not set, while an explicit zero is a valid limit. Category limits do not add to the overall limit. Copy previous year into an empty target year only; existing target values require explicit overwrite selection. All edits affect only the selected year.

### Goals

Fields: name, target amount, savings account, optional deadline. V1 default: one active goal per savings account to prevent double allocation; show this limitation in the form. Progress uses max(0, current account balance), with target percentage capped at 100% and any surplus shown separately. Linking an account means its existing balance contributes; explain this before saving. Allow editing, completing, and archiving goals. No goal operation creates financial transactions.

### Reminders

Support weekly, every two weeks, monthly, and yearly income/expense schedules. Display due and overdue unconfirmed occurrences, plus upcoming occurrences for the next 30 days. No transaction is created automatically. Confirm opens an editable entry form; saving links exactly one record to the occurrence. Allow skipping an occurrence. A confirmed occurrence shows its linked record; deleting that record marks it unconfirmed again.

Recurring amount edits create an effective-date version and do not rewrite transactions. Provide fixed-amount and percentage-change input, previewing the resulting amount and date before saving. Round the final amount after a percentage change to the nearest cent, half up (not the adjustment separately). For example, $1.00 reduced by 0.5% becomes $1.00. Example: $5,000 plus 3% becomes $5,150. Schedule changes preserve confirmed/skipped occurrences and regenerate only unconfirmed future occurrences from the effective date. Monthly/yearly days missing from a month use that month's final day. Ended schedules retain history.

### Reports

Support the same period selection as Dashboard and export filtered records as CSV. Reports: overview, category detail, monthly trends, account balances, annual budgets, goals, and prior-year comparison. Show current-year-to-date against the same elapsed date range in the previous year by default; offer full calendar-year comparison with explicit partial-current-year labeling. When dates include February 29, clamp the previous-year endpoint to February 28. Report detail tables must reconcile to filtered Records.

## 3. Calculation rules

Store money as integer cents; accept/display two decimal places. Reject invalid, nonfinite, negative, or zero transaction amounts. Budgets may be zero; goal targets must be positive. Store calendar dates as YYYY-MM-DD and timestamps in UTC. Default household timezone is America/Los_Angeles, configurable.

For ordinary accounts, income/refund increases balance and expense decreases it. Transfer subtracts from source and adds to destination. Internally credit cards use signed balances: debt is negative, credit is positive. A card purchase decreases balance; a refund or payment increases it. Display negative card balance as amount owed and positive balance as card credit.

Opening balance represents the balance immediately before transactions on opening_date. Reject transactions predating an affected account's opening date. Balance at date D = opening signed balance + signed movements from opening_date through D, inclusive. If D precedes opening_date, display Not available, not zero.

Net expenses = expense total minus refund total. Income total excludes refunds and transfers. Money left over = income total - net expenses. Opening balances, goal edits, and transfers are excluded from these period totals. Annual budget remaining = annual limit - calendar-year net expenses (or category net expenses). Budgets do not reset account balances.

Category percentage = category net expenses / total net expenses when total is positive. Use a bar chart capable of negative values for net refunds. If total is zero or negative, display percentages as unavailable and retain currency totals.

## 4. Persistence model

Use SQLite with migrations, foreign keys, and atomic database transactions. UUID identifiers; created_at and updated_at timestamps; integer revision on mutable records for conflict detection.

| Entity | Principal fields and constraints |
| --- | --- |
| settings | household_timezone; currency fixed to USD |
| accounts | id, name, type, opening_date, opening_balance_cents (signed), archived_at, revision |
| categories | id, name, kind, archived_at, revision; unique active name per kind |
| transactions | id, date, description, type, amount_cents, account_id, destination_account_id nullable, category_id nullable, notes nullable, source (manual/mcp/recurring), import_batch_id nullable, occurrence_id nullable unique, revision |
| annual_budgets | year unique, overall_limit_cents nullable, revision |
| category_budgets | year, category_id, limit_cents; unique year/category |
| savings_goals | id, name, target_cents, savings_account_id, deadline nullable, status, revision; one active goal per account |
| recurring_templates | id, name, status, revision |
| recurring_versions | id, template_id, effective_date, amount_cents, type, account_id, category_id, description, cadence, anchor_date, end_date nullable; unique template/effective_date |
| occurrences | id, template_id, due_date, version_id, status (unconfirmed/confirmed/skipped), revision; unique template/due_date |
| import_previews | id, expires_at, payload_hash, normalized proposed rows and review decisions, ledger_revision |
| import_batches | id, idempotency_key unique, preview_id unique, source_label nullable, payload_hash, committed_at, result summary |

Preview rows contain only normalized ledger fields, uncertainty notes, and duplicate decisions. Do not persist document text, images, OCR output, or attachments. Expire uncommitted previews after 24 hours. Financial entities referenced by history must not be cascade-deleted. Editing opening balances is explicit and recalculates account balances without changing transaction amounts.

## 5. API contract

Version prefix: /api/v1. JSON requests and responses; integer-cent amounts and ISO dates. Return {data: ...} on success and {error: {code, message, fields?}} on failure. Lists return pagination metadata; default page size 50, maximum 200. Validate all input in the API regardless of client.

| Resource | Operations |
| --- | --- |
| /health | GET readiness without financial information |
| /accounts | GET, POST; PATCH /:id; archive action |
| /categories | GET, POST; PATCH /:id; archive action |
| /transactions | GET with filters, POST; GET/PATCH/DELETE /:id |
| /budgets/:year | GET, PUT; POST /copy with sourceYear and explicit overwrite choice |
| /goals | GET, POST; PATCH /:id; complete/archive actions |
| /recurring | GET, POST; PATCH /:id; POST /:id/versions for effective-date changes |
| /reminders | GET by date range; POST /:id/confirm and /:id/skip |
| /reports/overview, /reports/categories, /reports/trends, /reports/balances, /reports/year-comparison | GET with period filters |
| /exports/transactions.csv | GET using Records filters |
| /imports/preview | POST normalized proposed records; creates a preview only |
| /imports/:previewId/commit | POST reviewed selection, approval acknowledgement, payload hash, and idempotency key |

Use 400 for malformed requests, 404 for missing records, 409 for revision or duplicate-commit conflicts, and 422 for invalid business data. Writes use expectedRevision for edits and deletion. A stale write must return a conflict rather than silently replace newer data. Transfers, recurring confirmations, and import commits are atomic. CSV export escapes spreadsheet formulas in text cells.

## 6. Import review and MCP

The assistant receives files in chat, extracts candidate records, reads accounts/categories and existing transactions, then requests an import preview. The preview reports normalized values, validation errors, uncertainty notes, and duplicate candidates. It creates no transactions.

Duplicate matching uses account, type, cents, date, and normalized description for exact candidates; also flag same-account/amount/type entries within three days with similar descriptions. These are review hints, not automatic deletions. Every proposed row has a stable client row ID and an explicit include or skip decision. Unresolved required fields block commit.

Show the user the final selected records and totals before committing. MCP approval acknowledgement records the assistant's assertion that the user approved that exact preview; it does not independently prove human consent. Enforce review order in the tool workflow. If selected values change after review, issue a new preview. Commit revalidates against the current ledger; new duplicate candidates or conflicting edits require refreshed review. An unchanged retry with the same idempotency key returns the original result. Reuse of a key with different content returns 409.

Commit is all-or-nothing for included rows. Return inserted IDs/count, explicitly skipped count, and errors if validation fails; validation failure inserts zero rows. Use integer cents throughout extraction normalization and saving.

MCP bridge: local stdio process calling the VM API, following the reference application pattern. Configure VM URL and scoped token during setup. Do not access SQLite directly.

Initial tools: list_accounts, list_categories, list_transactions, get_transaction, get_summary, preview_import, commit_import, create_transaction, update_transaction. When remaining features land, add read/write budget and goal tools, recurring-version/reminder tools, and report queries. Tool schemas expose required fields and side effects. Reviewed imports always use preview_import then commit_import; never bypass review using create_transaction.

## 7. Deployment and access

React/TypeScript frontend, Node.js/TypeScript backend, SQLite, and Docker Compose. Serve frontend and /api through one origin with a reverse proxy. Persist SQLite outside the container lifecycle. Configure database path, timezone, port, and MCP credential outside source control. Select ports after inspecting VM conflicts.

No application user login. Restrict exposed services to the home network using VM/network firewall configuration; do not configure public forwarding. MCP API access uses a scoped credential. Browser writes validate same-origin requests and use a browser-session CSRF token to avoid cross-site writes; do not enable wildcard CORS. Credentials and financial request bodies must not enter application logs.

Provide a documented SQLite-consistent backup using the database backup mechanism, and a tested restore procedure. Back up ledger data only. Original-file storage, app upload endpoints, and background document processing are absent.

## 8. Acceptance criteria

1. A couple can use one shared dataset on desktop and phone browsers without login on their home network.
2. A $100 purchase followed by a $100 card payment reports $100 spending, not $200.
3. A $20 refund for that purchase changes net category spending to $80 and updates the destination account correctly.
4. A transfer changes two account balances atomically without changing income, expenses, or money left over.
5. Opening balance of $1,000 plus $500 income minus $200 expenses yields $1,300; dates before opening show unavailable.
6. Records filtering, overview totals, category tables, and CSV export agree for the same period.
7. Default Dashboard opens to the current month; selecting last year shows that year's income, expenses, and money left over separately from ending balances.
8. Copying annual budgets changes only the target year. Overall and category budget progress are calculated independently.
9. Editing salary to increase 3% next January changes future reminders while existing income records remain byte-for-byte unchanged in financial fields.
10. Confirming a reminder twice creates one record; one-time amount overrides leave the recurring version unchanged.
11. Import preview creates zero transactions. Commit after review inserts exactly the approved rows; duplicate candidates can be deliberately kept or skipped.
12. Retrying an import inserts no additional rows. Stale review with new conflicts requires another preview.
13. The server contains normalized ledger data and import metadata but no original document contents or files.
14. A second active goal on the same savings account is rejected with a clear explanation.
15. Concurrent stale edits return a conflict. Backup restoration preserves records and balances.

## 9. Implementation decisions to resolve during build

VM address/OS and available ports, exact backup destination and retention, chart library, and final seeded category names. These do not block the specification. The one-active-goal-per-savings-account rule is a v1 simplification and may be expanded later with explicit allocation tracking.
