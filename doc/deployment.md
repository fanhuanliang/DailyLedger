# DailyLedger deployment and recovery

Local container and recovery checks use a disposable dataset. The VM runs Ubuntu. Production rollout still needs the VM address, available port, backup destination/retention and owner authorization. Do not publish or expose the app publicly. Keep GitHub private and exclude databases, backups, environment files and financial workbooks.

## Prepare the VM

Use the reviewed repository commit and Docker Compose. Copy `.env.example` to a local `.env`; configure `BIND_IP` to the VM's home-network address, an unused `APP_PORT`, and matching `APP_ORIGIN`. Generate a private `MCP_TOKEN` outside Git. Leave `COOKIE_SECURE=false` for local HTTP; enable it only with HTTPS. `CONTAINER_DB_PATH` is the container file in the persistent `/app/data` volume. `DB_PATH` is the separate host-development setting.

Review firewall rules to allow only the home network. Do not forward ports through the router. Inspect `docker compose config --quiet`, then build/start with `docker compose up --build -d --wait`. Verify `/api/v1/health`, the desktop browser and an actual phone on the home network. Check records, transfers/refunds, reports, reminders and CSV against a small owner-approved dataset. Restart the backend and confirm persistence. Connect the local stdio MCP bridge using its README only after the network restrictions and scoped credential are verified.

## Backup

The maintenance command uses SQLite's online backup API, which includes committed WAL data. It opens the source read-only without running migrations, checks database integrity/foreign keys and DailyLedger tables, then verifies the copy before publishing it. Publication refuses to overwrite an existing destination, even if another process creates it concurrently. The temporary file and destination share a filesystem that must support hard links. Failed copies do not publish a completed destination. The command logs no amounts, records, paths or credentials.

After `pnpm --filter @dailyledger/backend build`, host usage is:

```text
node backend/dist/maintenance.js backup CURRENT_LEDGER_FILE NEW_BACKUP_FILE
node backend/dist/maintenance.js restore BACKUP_FILE NEW_RESTORE_FILE
```

Quote paths containing spaces. The destination must be new; the source must be an existing DailyLedger database. Both operations copy the entire normalized ledger, settings, planning history and import metadata. They do not back up original documents, which the app never stores. Do not copy a live `.db` file alone while its WAL is active.

For the default container path, an example online backup inside the data volume is:

```sh
docker compose exec backend node backend/dist/maintenance.js backup /app/data/ledger.db /app/data/backups/ledger-NEW_TIMESTAMP.db
```

Replace `NEW_TIMESTAMP` with a unique filename and use the actual `CONTAINER_DB_PATH` as the source. Copy the completed backup off the application volume to the owner-selected protected backup destination. A copy inside the same volume is insufficient protection against loss of that volume. Alternatively mount the selected backup directory into a one-off maintenance container, granting the image's `node` user write permission. Schedule and retention await the owner's destination and preference; no automated deletion is configured.

## Restore into a new file

Never restore over a running database or remove its WAL/SHM files. Stop both services before switching the app to restored data:

```sh
docker compose stop frontend backend
docker compose run --rm --no-deps backend node backend/dist/maintenance.js restore /app/data/backups/SELECTED_BACKUP.db /app/data/ledger-restored-NEW_TIMESTAMP.db
```

If the backup is stored outside the volume, mount its directory into the maintenance container and use that mounted source path. On successful verification, set `CONTAINER_DB_PATH` in the VM's local `.env` to the new restored filename inside `/app/data`, then run `docker compose up -d --wait`. Keep the previous database intact as rollback evidence. Do not copy the old WAL/SHM files onto the restored file. Verify record IDs/revisions, balances, budgets, goals, reminder history and import retry metadata before accepting the recovery.

For rollback, stop the services, return `CONTAINER_DB_PATH` to the prior untouched database and start again. Any edits made after switching to the restored database belong to that restored dataset; switching back does not merge them. Do not use `docker compose down -v` on the production stack: it deletes the named ledger volume.

Backup API reference: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#backupdestination-options---promise
