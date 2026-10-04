# DailyLedger MCP bridge

This local stdio process calls the shared HTTP API. It never opens SQLite, accepts files, or stores original documents. The initial nine tools read accounts/categories/records/period summaries, preview and commit reviewed imports, and create/correct explicitly requested manual records.

Run `pnpm --filter @dailyledger/mcp-server build` from the repository root with Node24. Configure your MCP client to launch `node` with the absolute path to `mcp-server/dist/index.js`, an `API_URL` containing the app origin (no `/api` suffix), and the same `MCP_TOKEN` configured on the backend. Keep real credentials outside Git. Connect the production VM only after its address, ports and home-network restrictions are verified.

Import workflow: call `preview_import` with normalized proposed fields, stable client row IDs, explicit include/skip decisions, and uncertainty notes. Show its selected records, duplicate candidates, errors and totals to the owner. Obtain explicit approval of that exact preview before `commit_import`. Values or decisions changing require a new preview. Approval acknowledgement records the assistant's assertion, not independent proof of consent.

Commit uses the preview ID, unchanged SHA256 payload hash, and unique idempotency key. An unchanged retry reuses all three identifiers and returns the original result, even after preview expiry. An edited ledger/reference invalidates an uncommitted preview. Expiry is24h; previews contain only normalized data. Batches are atomic; invalid included rows produce zero transactions. Possible duplicates are hints that the owner can deliberately include or skip. Manual `create_transaction` must never substitute for reviewed document imports.

`pnpm test` from the repository root includes real child-process stdio integration against an isolated in-memory API. No household data is used. Backend summaries and derived balances are calculated by the same services used by browser/API clients; the bridge contains no financial calculations.
