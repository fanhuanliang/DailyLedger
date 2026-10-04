import { computeAccountBalance } from './balances';
import type { Transaction } from '../types/domain';
import { parsePageRequest, paginationMeta } from '../lib/pagination';
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Account, AccountType } from '../types/domain';
import { badRequest, conflict, notFound, unprocessable } from '../lib/errors';
import { isValidCalendarDate } from '../lib/calendarDate';

const ACCOUNT_TYPES: readonly AccountType[] = ['checking', 'savings', 'cash', 'credit_card'];

export interface CreateAccountInput {
  name: string;
  type: string;
  openingDate: string;
  openingBalanceCents: number;
}

export interface UpdateAccountInput {
  name?: unknown;
  openingDate?: unknown;
  openingBalanceCents?: unknown;
}

function validateCreate(input: CreateAccountInput): void {
  if (typeof input.name !== 'string' || input.name.trim().length === 0) throw badRequest('name is required.', { name: 'required' });
  if (!ACCOUNT_TYPES.includes(input.type as AccountType)) throw badRequest('type must be one of checking, savings, cash, credit_card.', { type: 'invalid' });
  if (typeof input.openingDate !== 'string' || !isValidCalendarDate(input.openingDate)) throw badRequest('openingDate must be a real YYYY-MM-DD calendar date.', { openingDate: 'invalid' });
  if (!Number.isSafeInteger(input.openingBalanceCents)) throw badRequest('openingBalanceCents must be a safe integer number of cents.', { openingBalanceCents: 'invalid' });
}

export function listAccounts(db: Database.Database, includeArchived: boolean, query: Record<string, unknown> = {}) {
  const { page, pageSize } = parsePageRequest(query);
  const asOfDate = query.asOfDate === undefined ? householdToday(db) : query.asOfDate;
  if (typeof asOfDate !== 'string' || !isValidCalendarDate(asOfDate)) throw badRequest('asOfDate must be a real YYYY-MM-DD date.');
  const where = includeArchived ? '' : 'WHERE archived_at IS NULL';
  const total = (db.prepare(`SELECT count(*) AS count FROM accounts ${where}`).get() as { count: number }).count;
  const items = db.prepare(`SELECT * FROM accounts ${where} ORDER BY archived_at IS NOT NULL, name, id LIMIT ? OFFSET ?`)
    .all(pageSize, (page - 1) * pageSize) as Account[];
  const movements = db.prepare('SELECT * FROM transactions WHERE (account_id = ? OR destination_account_id = ?) AND date <= ? ORDER BY date, created_at, id');
  const summaries = items.map((account) => ({
    ...account,
    balance_as_of: asOfDate,
    balance_cents: computeAccountBalance(account, movements.all(account.id, account.id, asOfDate) as Transaction[], asOfDate),
  }));
  return { items: summaries, meta: paginationMeta(page, pageSize, total) };
}
export function getAccount(db: Database.Database, id: string): Account {
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Account | undefined;
  if (!row) throw notFound('Account not found.');
  return row;
}

export function createAccount(db: Database.Database, input: CreateAccountInput): Account {
  validateCreate(input);
  const id = randomUUID();
  db.prepare(
    'INSERT INTO accounts (id, name, type, opening_date, opening_balance_cents) VALUES (?, ?, ?, ?, ?)',
  ).run(id, input.name.trim(), input.type, input.openingDate, input.openingBalanceCents);
  return getAccount(db, id);
}

export function updateAccount(db: Database.Database, id: string, patch: UpdateAccountInput, expectedRevision: number): Account {
  const current = getAccount(db, id);
  if (current.revision !== expectedRevision) throw conflict('Account has been changed by someone else.');
  if (patch.name !== undefined && typeof patch.name !== 'string') throw badRequest('name must be a string.', { name: 'invalid' });
  if (patch.openingDate !== undefined && typeof patch.openingDate !== 'string') throw badRequest('openingDate must be a string.', { openingDate: 'invalid' });
  if (patch.openingBalanceCents !== undefined && typeof patch.openingBalanceCents !== 'number') throw badRequest('openingBalanceCents must be a number.', { openingBalanceCents: 'invalid' });

  const name = patch.name !== undefined ? (patch.name as string).trim() : current.name;
  const openingDate = patch.openingDate !== undefined ? (patch.openingDate as string) : current.opening_date;
  const openingBalanceCents = patch.openingBalanceCents !== undefined ? (patch.openingBalanceCents as number) : current.opening_balance_cents;
  if (name.length === 0) throw badRequest('name is required.', { name: 'required' });
  if (!isValidCalendarDate(openingDate)) throw badRequest('openingDate must be a real YYYY-MM-DD calendar date.', { openingDate: 'invalid' });
  if (!Number.isSafeInteger(openingBalanceCents)) throw badRequest('openingBalanceCents must be a safe integer number of cents.', { openingBalanceCents: 'invalid' });
  if (openingDate > current.opening_date) {
    const earlierTransaction = db
      .prepare('SELECT 1 FROM transactions WHERE (account_id = ? OR destination_account_id = ?) AND date < ? LIMIT 1')
      .get(id, id, openingDate);
    if (earlierTransaction) {
      throw unprocessable(
        'Moving the opening date later would exclude existing transactions from this account\'s history.',
        { openingDate: 'excludes_existing_history' },
      );
    }
  }
  db.prepare(
    `UPDATE accounts SET name = ?, opening_date = ?, opening_balance_cents = ?, revision = revision + 1,
     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND revision = ?`,
  ).run(name, openingDate, openingBalanceCents, id, expectedRevision);
  return getAccount(db, id);
}

export function archiveAccount(db: Database.Database, id: string, expectedRevision: number): Account {
  const current = getAccount(db, id);
  if (current.revision !== expectedRevision) throw conflict('Account has been changed by someone else.');
  db.prepare(
    `UPDATE accounts SET archived_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), revision = revision + 1,
     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND revision = ?`,
  ).run(id, expectedRevision);
  return getAccount(db, id);
}

export function isAccountArchived(account: Account): boolean {
  return account.archived_at !== null;
}


function householdToday(db: Database.Database): string {
  const { household_timezone: timeZone } = db.prepare('SELECT household_timezone FROM settings WHERE id = 1').get() as { household_timezone: string };
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
