# DailyLedger implementation plan

## Purpose and users

DailyLedger helps a husband and wife record household income and expenses, manage annual budgets, track savings goals, and understand their finances. Both use the same data, with no login. Currency is USD only.

## Hosting and access

- Develop in `<project-directory>`.
- Run the app in a VM on the home server.
- Access it through browsers on phones and computers, on the home network only.
- Follow the reference application's general structure: React frontend, Node.js/TypeScript API, SQLite database, Docker Compose deployment, and a separate MCP bridge.
- Choose available ports during implementation so existing applications are unaffected.
- Keep the database in persistent storage and provide a simple backup and restore procedure.
- No public access or external bank connection is planned for the first version.

## App layout

Use an Excel-style tab layout with one shared Records table. On computers, prioritize readable tables; on phones, provide compact records and a prominent Add transaction button.

### Records

All transactions appear in one table, with categories as a column rather than separate category sheets.

Core fields: date, description or merchant, USD amount, transaction type, category, and payment account. Notes are optional.

- Add, edit, and delete records manually.
- Search and filter by date, merchant, category, account, and transaction type.
- Default new entries to today's date.
- Support income, expenses, transfers, and refunds.
- Transfers between accounts do not count as income or spending.
- Credit card payments are transfers so purchases are not counted twice.
- Refunds reduce spending in the relevant category.
- Allow corrections to individual records without changing recurring templates.

### Accounts

Track checking, savings, credit cards, and cash separately. Each account has a name, type, starting balance, and starting date. Calculate its balance from the starting balance and subsequent transactions. Show credit card amounts owed clearly.

Keep account handling simple; statement reconciliation is deferred.

### Categories

Start with editable categories such as housing, groceries, utilities, transportation, dining, healthcare, shopping, entertainment, and income. Users can add or rename categories. Keep historical transactions usable when categories change; prevent deleting a category that is still in use unless its records are reassigned.

### Budgets

- Use calendar years, January through December.
- Support an overall annual spending budget and annual category limits.
- Show annual budget, spending so far, and remaining amount for both.
- Monthly views show that month's contribution to annual spending; no monthly rollover system is needed.
- Offer to copy the previous year's budgets into a new year, then allow adjustments.
- Copying or editing a new year's budget does not change previous years.
- Treat the overall budget and category limits as distinct checks, not amounts to add together.

### Savings goals

Each goal has a name, target amount, optional deadline, and linked savings account. Show progress simply. During implementation, choose a clear allocation rule if multiple goals share one account so the same funds are not presented as independently available for every goal.

### Recurring bills and income

- Show upcoming and overdue reminders inside the app only.
- Users confirm the actual date and amount before a transaction is saved.
- Support changing a recurring amount from a selected effective date.
- Example: a 3% salary increase starting January of the next year changes future reminders only.
- Existing transaction records remain unchanged by any recurring schedule edit.
- A one-time adjustment during confirmation does not change the recurring schedule.
- Prevent confirming the same occurrence twice.

### Dashboard and reports

Default to the current month. Provide month, calendar year, and custom date-range selections. Combine charts with detailed tables.

Initial reports:

1. Income, expenses, and money left over (income minus expenses).
2. Spending totals and percentages by category.
3. Monthly income and spending trends.
4. Account balances, with credit card debt shown clearly.
5. Overall and category annual budget progress.
6. Savings goal progress.
7. Current-year and previous-year comparisons, including each year's money left over.

Distinguish money left over during a period from account balances, which include starting balances and other periods. Transfers are excluded from income and expense reports. Clearly label partial-year comparisons.

After a couple of months of data, the user can ask the assistant to review the records and refine the reports. This is an on-request workflow, not a scheduled automation.

## Assistant imports and MCP

Statements and receipts are provided in this chat and processed here. DailyLedger does not store original statements, receipt images, or PDF files, and the first version does not need an app file-upload screen or a server-side OCR service.

Import workflow:

1. The user supplies a CSV, statement PDF, or receipt image in chat.
2. The assistant extracts proposed transactions and suggests categories and accounts.
3. Compare against existing ledger data and highlight potential duplicates, missing fields, and uncertain values.
4. Show the user a review preview.
5. Apply the reviewed transactions through DailyLedger MCP tools only after the user's approval.
6. Return a concise result with inserted, skipped, and failed entries.

Store transaction data and lightweight import metadata only, such as an import batch identifier and source label. Do not store original file contents in the app database or server filesystem. This policy concerns DailyLedger storage; it does not define the chat platform's attachment retention.

The MCP bridge calls the same backend API as the app so manual edits and assistant edits share validation and one database. It must be connected to the assistant environment during setup; it is not currently available in this chat.

Initial MCP capabilities: list accounts and categories, query records and summaries, preview a proposed import with duplicate candidates, commit an approved import batch, and create or edit individual transactions. Add budget, goal, recurring-template, and report operations as those app features are implemented.

Use a scoped credential for the MCP bridge even though the home browser interface has no login. Limit network exposure to the home network. Duplicate checks must flag similar transactions for review rather than silently deleting legitimate repeated purchases. Import retries must not create duplicate records.

## Data and correctness

Suggested entities: accounts, categories, transactions, annual budgets, annual category budgets, savings goals, recurring templates and their effective-date versions, confirmed occurrences, and import batches.

- Store USD amounts as integer cents.
- Use stable record identifiers and validate all writes in the backend.
- Represent transfers as a single linked operation affecting two accounts atomically.
- Keep transaction dates as calendar dates and use a configured household timezone for reminders and current-period defaults.
- Keep recurring definitions separate from confirmed transactions.
- Generate reports from ledger data rather than maintaining independently editable totals.

## Implementation sequence

1. Foundation: frontend, API, database, responsive tab layout, and Docker deployment configuration.
2. Core ledger: accounts, opening balances, categories, one Records table, manual entry, transfers, refunds, and filters.
3. MCP imports: shared API access, review preview, duplicate detection, approved batch insertion, and retry protection.
4. Planning: annual budgets, savings goals, and in-app recurring reminders with effective-date edits.
5. Insights: dashboard, charts, detailed reports, year selection, previous-year comparison, and CSV export.
6. VM rollout: choose ports, configure home-network access, verify phone and desktop use, establish backups, and connect the MCP bridge.

## First-version verification

Verify that manual and MCP entries appear in the same ledger; approved imports save exactly once; transfers and credit card payments do not inflate spending; refunds reduce category spending; starting balances produce correct account totals; annual budget copies preserve previous years; recurring changes preserve existing records; confirmation creates only one transaction per occurrence; and monthly/yearly report totals agree with the Records table. Check the responsive interface on phone and desktop sizes.

## Deferred features

Direct bank synchronization, server-side file scanning or original-file storage, statement reconciliation, browser notifications, separate user accounts, multiple currencies, and advanced split-category purchases. Revisit these only when the basic workflow is working and the user wants them.

## Completion criteria

The couple can use the app at home on phones and computers, maintain one ledger, track their accounts and annual budgets, confirm recurring entries without altering history, inspect monthly and yearly results, and have the assistant import reviewed transaction data through MCP.
