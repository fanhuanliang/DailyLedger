import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { openDatabase } from '../src/db/connection';
import { createAccount } from '../src/services/accountsService';
import { createTransaction } from '../src/services/transactionsService';
import { getSummary } from '../src/services/summaryService';
import { listAccounts } from '../src/services/accountsService';
import { copyLedgerDatabase } from '../src/maintenance';
import { createGoal } from '../src/services/goalsService';
import { createRecurring, listReminders, confirmReminder } from '../src/services/recurringService';
import { previewImport, commitImport } from '../src/services/importsService';
import { saveBudget } from '../src/services/budgetsService';

describe('AC15 SQLite-consistent backup and restore', () => {
  test('backs up a live WAL ledger and restores identical IDs, revisions, balances and summaries into a fresh path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dailyledger-backup-'));
    const db = openDatabase(join(dir, 'live.db'));
    try {
      db.pragma('wal_autocheckpoint = 0');
      const account = createAccount(db, { name: 'Synthetic savings', type: 'savings', openingDate: '2026-01-01', openingBalanceCents: 10000 });
      const category = db.prepare("SELECT id FROM categories WHERE name='Salary'").get() as { id: string };
      createTransaction(db, { date: '2026-01-10', description: 'Synthetic income', type: 'income', amountCents: 20000, accountId: account.id, categoryId: category.id });
      createGoal(db, { name: 'Synthetic reserve', targetCents: 40000, savingsAccountId: account.id });
      createRecurring(db, { name: 'Synthetic recurring income', effectiveDate: '2026-01-01', cadence: 'monthly', anchorDate: '2026-01-15', endDate: null, amountCents: 1000, type: 'income', accountId: account.id, categoryId: category.id, description: 'Synthetic recurring income' });
      const occurrence = listReminders(db, { dateFrom: '2026-01-01', dateTo: '2026-01-31' }).items[0]!;
      confirmReminder(db, occurrence.id, { expectedRevision: occurrence.revision });
      const expense = db.prepare("SELECT id FROM categories WHERE name='Groceries'").get() as { id: string };
      const preview = previewImport(db, { rows: [{ clientRowId: 'synthetic-backup-import', decision: 'include', record: { date: '2026-01-20', description: 'Synthetic purchase', amountCents: 500, type: 'expense', accountId: account.id, categoryId: expense.id } }] });
      commitImport(db, preview.id, { approvalAcknowledged: true, payloadHash: preview.payloadHash, idempotencyKey: 'synthetic-backup-key' });
      saveBudget(db, 2026, { expectedRevision: null, overallLimitCents: 10000, categoryLimits: [] });
      expect(existsSync(join(dir, 'live.db-wal'))).toBe(true);
      const snapshot = db.prepare('SELECT * FROM transactions ORDER BY id').all();
      const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map(row => row.name);
      const fullSnapshot = tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
      const balances = listAccounts(db, true, { asOfDate: '2026-01-31' });
      const summary = getSummary(db, { dateFrom: '2026-01-01', dateTo: '2026-01-31' });
      await copyLedgerDatabase(join(dir, 'live.db'), join(dir, 'backup.db'));
      await copyLedgerDatabase(join(dir, 'backup.db'), join(dir, 'restored.db'));
      const restored = openDatabase(join(dir, 'restored.db'));
      try {
        expect(restored.prepare('SELECT * FROM transactions ORDER BY id').all()).toEqual(snapshot);
        expect(tables.map(table => restored.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())).toEqual(fullSnapshot);
        expect(listAccounts(restored, true, { asOfDate: '2026-01-31' })).toEqual(balances);
        expect(getSummary(restored, { dateFrom: '2026-01-01', dateTo: '2026-01-31' })).toEqual(summary);
        expect(restored.pragma('integrity_check', { simple: true })).toBe('ok');
        expect(restored.pragma('foreign_key_check')).toEqual([]);
      } finally { restored.close(); }
    } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
  });
  test('refuses destination overwrite and same-file backup without altering existing data', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dailyledger-backup-'));
    const source = join(dir, 'source.db'), destination = join(dir, 'existing.db'), db = openDatabase(source);
    try {
      writeFileSync(destination, 'existing content');
      await expect(copyLedgerDatabase(source, destination)).rejects.toThrow('exists');
      await expect(copyLedgerDatabase(source, source)).rejects.toThrow('exists');
      expect(db.prepare('SELECT currency FROM settings').get()).toEqual({ currency: 'USD' });
    } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
  });
  test('missing or unrelated SQLite sources do not create a destination', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dailyledger-backup-')), destination = join(dir, 'backup.db');
    try {
      // Native SQLite errors can originate in another Jest VM realm. Assert
      // the actual SQLite error code instead of realm-sensitive instanceof.
      await expect(copyLedgerDatabase(join(dir, 'missing.db'), destination)).rejects.toMatchObject({ code: 'SQLITE_CANTOPEN' });
      expect(existsSync(join(dir, 'missing.db'))).toBe(false);
      expect(existsSync(destination)).toBe(false);
      const unrelated = new Database(join(dir, 'unrelated.db')); unrelated.exec('CREATE TABLE unrelated(id INTEGER)'); unrelated.close();
      await expect(copyLedgerDatabase(join(dir, 'unrelated.db'), destination)).rejects.toThrow('DailyLedger');
      expect(existsSync(destination)).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
