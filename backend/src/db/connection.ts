import { recurringSchedules } from './migrations/007-recurring-schedules';
import { savingsGoals } from './migrations/006-savings-goals';
import { annualBudgets } from './migrations/005-annual-budgets';
import { importReview } from './migrations/004-import-review';
import { ledgerGuards } from './migrations/003-ledger-guards';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { initialSettings } from './migrations/001-settings';
import { ledgerCore } from './migrations/002-ledger';

export function openDatabase(path: string, initialTimezone = 'America/Los_Angeles'): Database.Database {
  new Intl.DateTimeFormat('en-US', { timeZone: initialTimezone }).format();
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`);
    db.transaction(() => {
      for (const migration of [initialSettings, ledgerCore, ledgerGuards, importReview, annualBudgets, savingsGoals, recurringSchedules]) {
        if (!db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(migration.version)) {
          db.exec(migration.sql);
          if (migration.version === 1) db.prepare('UPDATE settings SET household_timezone = ? WHERE id = 1').run(initialTimezone);
          db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version);
        }
      }
    })();
    return db;
  } catch (error) { db.close(); throw error; }
}
