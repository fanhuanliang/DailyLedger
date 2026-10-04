# Decisions

## 2026-10-03 - Collaboration and Git
Codex codes and coordinates by default; Claude Code independently reviews. Only one code writer at a time. Commit each reviewed and verified step locally; no push is authorized. The user requested this workflow.

## Open implementation decisions
- VM OS/address and available ports.
- Backup destination and retention.
- Chart library and final seeded categories.
- Verify runtime/dependency support before scaffolding; do not blindly inherit old versions from reference application.
