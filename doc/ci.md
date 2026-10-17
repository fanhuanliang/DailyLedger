# CI and deployment

The CI workflow runs on pushes to main, pull requests targeting main, and manual dispatch from Actions > CI > Run workflow. GitHub-hosted Ubuntu runners install the pinned pnpm version with Node 24, then run application tests, strict type checks, production builds, and an isolated Docker Compose web/API smoke check. Actions are pinned to full commit IDs. Test data is synthetic; no household database, VM settings or API token is needed.

The container test uses its own disposable project and removes that test volume afterward. Production database volumes must never be removed during an update.

Automatic production deployment belongs in a separate private deployment repository with a dedicated self-hosted runner. Public pull requests must not execute on the home server. The private workflow polls the public main CI result and deploys only the current successful commit. It must be explicitly enabled after the owner installs and verifies that dedicated runner.

Deployment builds before interrupting the running app, creates an integrity-checked SQLite backup, copies and checksum-verifies it outside the database volume, preserves the existing named volume, and checks backend and web/API readiness. An unavailable/failed backup stops deployment before shutdown. Database migrations are not automatically reversed; failures after shutdown require owner recovery using the retained backup. Off-VM backups remain a separate responsibility.

The owner performs VM commands. GitHub does not store the VM's database, statements, API token, local usernames or network addresses. Runtime paths and credentials remain outside Git. The current container database path in the VM's private environment must remain selected across updates.
