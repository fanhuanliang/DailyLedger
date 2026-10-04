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
