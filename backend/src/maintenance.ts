import Database from 'better-sqlite3';
import { existsSync, mkdirSync, openSync, closeSync, linkSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

function checkLedger(db: Database.Database): void {
  const foreignKeyErrors = db.pragma('foreign_key_check');
  if (db.pragma('integrity_check', { simple: true }) !== 'ok' || !Array.isArray(foreignKeyErrors) || foreignKeyErrors.length !== 0) throw new Error('DailyLedger database integrity check failed.');
  try {
    const setting = db.prepare('SELECT currency FROM settings WHERE id=1').get() as { currency: string } | undefined;
    if (setting?.currency !== 'USD') throw new Error('Invalid currency.');
    for (const name of ['schema_migrations', 'accounts', 'categories', 'transactions']) db.prepare(`SELECT 1 FROM ${name} LIMIT 1`).get();
  } catch { throw new Error('Source is not a DailyLedger database.'); }
}

// Uses SQLite's online backup mechanism, including committed WAL data. Restore
// uses the same mechanism into a NEW path; replacing a running ledger is forbidden.
export async function copyLedgerDatabase(source: string, destination: string): Promise<void> {
  if (!source || !destination || source === ':memory:' || destination === ':memory:') throw new Error('Explicit database file paths are required.');
  const target = resolve(destination);
  if (existsSync(target)) throw new Error('Destination exists; choose a new path.');
  const db = new Database(resolve(source), { readonly: true, fileMustExist: true });
  let temporary: string | undefined;
  try {
    checkLedger(db);
    mkdirSync(dirname(target), { recursive: true });
    const path = target + '.' + randomUUID() + '.partial.db';
    const handle = openSync(path, 'wx', 0o600); closeSync(handle); temporary = path;
    await db.backup(path);
    const copy = new Database(path, { readonly: true, fileMustExist: true });
    try { checkLedger(copy); } finally { copy.close(); }
    // Atomic no-overwrite publication, even if another process creates target
    // after the initial existence check. Temp and target share one filesystem.
    linkSync(path, target);
  } finally {
    db.close();
    if (temporary && existsSync(temporary)) unlinkSync(temporary);
  }
}

async function main(): Promise<void> {
  const [operation, source, destination, ...extra] = process.argv.slice(2);
  if (!['backup', 'restore'].includes(operation ?? '') || !source || !destination || extra.length) {
    console.error('Usage: node backend/dist/maintenance.js backup|restore SOURCE_FILE NEW_DESTINATION_FILE');
    process.exitCode = 1; return;
  }
  try { await copyLedgerDatabase(source, destination); console.info('Database copy completed and integrity verified.'); }
  catch { console.error('Database copy failed. Check the source, integrity, permissions, and that the destination is new.'); process.exitCode = 1; }
}
if (require.main === module) void main();
