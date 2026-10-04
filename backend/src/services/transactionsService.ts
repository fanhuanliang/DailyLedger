import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Transaction, TransactionType } from '../types/domain';
import { badRequest, conflict, notFound, unprocessable } from '../lib/errors';
import { parsePageRequest, paginationMeta } from '../lib/pagination';
import { isValidCalendarDate } from '../lib/calendarDate';

const TYPES: readonly TransactionType[] = ['income', 'expense', 'refund', 'transfer'];

export interface TransactionInput {
  date?: unknown;
  description?: unknown;
  type?: unknown;
  amountCents?: unknown;
  accountId?: unknown;
  destinationAccountId?: unknown;
  categoryId?: unknown;
  notes?: unknown;
}

export interface TransactionFilters {
  dateFrom?: unknown;
  dateTo?: unknown;
  text?: unknown;
  categoryId?: unknown;
  accountId?: unknown;
  type?: unknown;
  page?: unknown;
  pageSize?: unknown;
}

interface ValidatedTransaction {
  date: string;
  description: string;
  type: TransactionType;
  amountCents: number;
  accountId: string;
  destinationAccountId: string | null;
  categoryId: string | null;
  notes: string | null;
}

interface AccountRow { id: string; opening_date: string; archived_at: string | null }
interface CategoryRow { id: string; kind: 'income' | 'expense'; archived_at: string | null }

function loadAccount(db: Database.Database, id: string, label: string): AccountRow {
  const row = db.prepare('SELECT id, opening_date, archived_at FROM accounts WHERE id = ?').get(id) as AccountRow | undefined;
  if (!row) throw badRequest(`${label} does not reference an existing account.`, { [label]: 'not_found' });
  return row;
}

function loadCategory(db: Database.Database, id: string): CategoryRow {
  const row = db.prepare('SELECT id, kind, archived_at FROM categories WHERE id = ?').get(id) as CategoryRow | undefined;
  if (!row) throw badRequest('categoryId does not reference an existing category.', { categoryId: 'not_found' });
  return row;
}

function requiredCategoryKindFor(type: TransactionType): 'income' | 'expense' | null {
  if (type === 'income') return 'income';
  if (type === 'expense' || type === 'refund') return 'expense';
  return null;
}

function optionalId(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw badRequest(`${field} must be a string.`, { [field]: 'invalid' });
  return value;
}

function optionalNotes(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw badRequest('notes must be a string.', { notes: 'invalid' });
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validateCore(db: Database.Database, input: TransactionInput, existing?: Transaction): ValidatedTransaction {
  if (typeof input.type !== 'string' || !TYPES.includes(input.type as TransactionType)) throw badRequest('type must be income, expense, refund, or transfer.', { type: 'invalid' });
  if (typeof input.description !== 'string' || input.description.trim().length === 0) throw badRequest('description is required.', { description: 'required' });
  if (typeof input.date !== 'string' || !isValidCalendarDate(input.date)) throw badRequest('date must be a real YYYY-MM-DD calendar date.', { date: 'invalid' });
  if (typeof input.amountCents !== 'number' || !Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw badRequest('amountCents must be a positive integer number of cents.', { amountCents: 'invalid' });
  }
  if (typeof input.accountId !== 'string' || input.accountId.length === 0) throw badRequest('accountId must be a string.', { accountId: 'invalid' });

  const type = input.type as TransactionType;
  const date = input.date;
  const description = input.description;
  const amountCents = input.amountCents;
  const accountId = input.accountId;
  const destinationAccountId = optionalId(input.destinationAccountId, 'destinationAccountId');
  const categoryId = optionalId(input.categoryId, 'categoryId');
  const notes = optionalNotes(input.notes);

  const source = loadAccount(db, accountId, 'accountId');
  if (source.archived_at && existing?.account_id !== accountId) throw unprocessable('accountId refers to an archived account and cannot receive new entries.', { accountId: 'archived' });
  if (date < source.opening_date) throw unprocessable('date is before the account opening date.', { date: 'before_opening_date' });

  if (type === 'transfer') {
    if (!destinationAccountId) throw badRequest('destinationAccountId is required for transfers.', { destinationAccountId: 'required' });
    if (destinationAccountId === accountId) throw badRequest('destinationAccountId must differ from accountId.', { destinationAccountId: 'same_account' });
    if (categoryId) throw badRequest('Transfers cannot have a category.', { categoryId: 'not_allowed' });
    const destination = loadAccount(db, destinationAccountId, 'destinationAccountId');
    if (destination.archived_at && existing?.destination_account_id !== destinationAccountId) throw unprocessable('destinationAccountId refers to an archived account and cannot receive new entries.', { destinationAccountId: 'archived' });
    if (date < destination.opening_date) throw unprocessable('date is before the destination account opening date.', { date: 'before_opening_date' });
    return { date, description, type, amountCents, accountId, destinationAccountId, categoryId: null, notes };
  }

  if (destinationAccountId) throw badRequest('destinationAccountId is only allowed for transfers.', { destinationAccountId: 'not_allowed' });
  const requiredKind = requiredCategoryKindFor(type);
  if (!categoryId) throw badRequest(`categoryId is required for ${type} transactions.`, { categoryId: 'required' });
  const category = loadCategory(db, categoryId);
  if (category.kind !== requiredKind) throw badRequest(`categoryId must reference a ${requiredKind} category for ${type} transactions.`, { categoryId: 'wrong_kind' });
  if (category.archived_at && existing?.category_id !== categoryId) throw unprocessable(`categoryId refers to an archived category; choose an active ${requiredKind} category.`, { categoryId: 'archived' });
  return { date, description, type, amountCents, accountId, destinationAccountId: null, categoryId, notes };
}

export function validateTransactionInput(db: Database.Database, input: TransactionInput): void { validateCore(db, input); }

function rowToTransaction(row: Record<string, unknown>): Transaction {
  return row as unknown as Transaction;
}

export function createTransaction(db: Database.Database, input: TransactionInput): Transaction {
  const validated = validateCore(db, input);
  const id = randomUUID();
  db.prepare(
    `INSERT INTO transactions (id, date, description, type, amount_cents, account_id, destination_account_id, category_id, notes, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')`,
  ).run(
    id,
    validated.date,
    validated.description.trim(),
    validated.type,
    validated.amountCents,
    validated.accountId,
    validated.destinationAccountId,
    validated.categoryId,
    validated.notes,
  );
  return getTransaction(db, id);
}

export function getTransaction(db: Database.Database, id: string): Transaction {
  const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  if (!row) throw notFound('Transaction not found.');
  return rowToTransaction(row as Record<string, unknown>);
}

export function updateTransaction(db: Database.Database, id: string, input: TransactionInput, expectedRevision: number): Transaction {
  const current = getTransaction(db, id);
  if (current.revision !== expectedRevision) throw conflict('Transaction has been changed by someone else.');
  const validated = validateCore(db, input, current);
  db.prepare(
    `UPDATE transactions SET date = ?, description = ?, type = ?, amount_cents = ?, account_id = ?, destination_account_id = ?,
     category_id = ?, notes = ?, revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ? AND revision = ?`,
  ).run(
    validated.date,
    validated.description.trim(),
    validated.type,
    validated.amountCents,
    validated.accountId,
    validated.destinationAccountId,
    validated.categoryId,
    validated.notes,
    id,
    expectedRevision,
  );
  return getTransaction(db, id);
}

export function deleteTransaction(db: Database.Database, id: string, expectedRevision: number): void {
  const current = getTransaction(db, id);
  if (current.revision !== expectedRevision) throw conflict('Transaction has been changed by someone else.');
  db.prepare('DELETE FROM transactions WHERE id = ? AND revision = ?').run(id, expectedRevision);
}

function optionalFilterString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) throw badRequest(`${field} must be a single string value.`, { [field]: 'invalid' });
  return value;
}

export function listTransactions(db: Database.Database, filters: TransactionFilters) {
  const { page, pageSize } = parsePageRequest({ page: filters.page, pageSize: filters.pageSize });
  const dateFrom = optionalFilterString(filters.dateFrom, 'dateFrom');
  const dateTo = optionalFilterString(filters.dateTo, 'dateTo');
  const categoryId = optionalFilterString(filters.categoryId, 'categoryId');
  const accountId = optionalFilterString(filters.accountId, 'accountId');
  const type = optionalFilterString(filters.type, 'type');
  const text = optionalFilterString(filters.text, 'text');

  if (dateFrom && !isValidCalendarDate(dateFrom)) throw badRequest('dateFrom must be a real calendar date.');
  if (dateTo && !isValidCalendarDate(dateTo)) throw badRequest('dateTo must be a real calendar date.');
  if (dateFrom && dateTo && dateFrom > dateTo) throw badRequest('dateFrom must not follow dateTo.');
  if (type && !TYPES.includes(type as TransactionType)) throw badRequest('Unknown transaction type.');

  const clauses: string[] = [];
  const params: unknown[] = [];

  if (dateFrom) { clauses.push('date >= ?'); params.push(dateFrom); }
  if (dateTo) { clauses.push('date <= ?'); params.push(dateTo); }
  if (categoryId) { clauses.push('category_id = ?'); params.push(categoryId); }
  if (accountId) { clauses.push('(account_id = ? OR destination_account_id = ?)'); params.push(accountId, accountId); }
  if (type) { clauses.push('type = ?'); params.push(type); }
  if (text) { clauses.push('(description LIKE ? OR notes LIKE ?)'); params.push(`%${text}%`, `%${text}%`); }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT count(*) AS count FROM transactions ${where}`).get(...params) as { count: number }).count;
  const rows = db
    .prepare(`SELECT * FROM transactions ${where} ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize);
  return { items: rows.map((row) => rowToTransaction(row as Record<string, unknown>)), meta: paginationMeta(page, pageSize, total) };
}
