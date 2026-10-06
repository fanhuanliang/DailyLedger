import type Database from 'better-sqlite3';
import type { Transaction } from '../types/domain';
import { badRequest, unprocessable } from '../lib/errors';
import { isValidCalendarDate } from '../lib/calendarDate';
import { getHouseholdToday } from '../lib/householdTime';
import { listTransactions, type TransactionFilters } from './transactionsService';
import { computeIncomeTotal, computeNetExpenses, computeMoneyLeftOver } from './periodTotals';
import { listAccounts } from './accountsService';
import { getBudget } from './budgetsService';
import { listGoals } from './goalsService';
import { listReminders } from './recurringService';

export interface ReportQuery extends TransactionFilters { mode?: unknown; year?: unknown }
function yearText(year: number): string { return String(year).padStart(4, '0'); }
function lastDay(year: number, month: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month, 0);
  return date.getUTCDate();
}
export function reportPeriod(db: Database.Database, query: TransactionFilters) {
  let dateFrom = query.dateFrom, dateTo = query.dateTo;
  if (dateFrom === undefined && dateTo === undefined) {
    const today = getHouseholdToday(db), year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7));
    dateFrom = today.slice(0, 7) + '-01';
    dateTo = today.slice(0, 7) + '-' + String(lastDay(year, month)).padStart(2, '0');
  }
  if (typeof dateFrom !== 'string' || typeof dateTo !== 'string' || !isValidCalendarDate(dateFrom) || !isValidCalendarDate(dateTo) || dateFrom > dateTo) {
    throw badRequest('Supply a valid inclusive dateFrom/dateTo range.');
  }
  return { dateFrom, dateTo };
}
function records(db: Database.Database, query: TransactionFilters): Transaction[] {
  const all: Transaction[] = [];
  for (let page = 1; ; page++) {
    const result = listTransactions(db, { ...query, page, pageSize: 200 });
    all.push(...result.items);
    if (page >= result.meta.totalPages) return all;
  }
}
function totals(rows: Transaction[]) {
  try {
    return { incomeCents: computeIncomeTotal(rows), netExpensesCents: computeNetExpenses(rows), moneyLeftOverCents: computeMoneyLeftOver(rows), recordCount: rows.length };
  } catch { throw unprocessable('Computed report totals exceed the supported integer-cent range.'); }
}
function categories(db: Database.Database, rows: Transaction[]) {
  const totalNetExpensesCents = totals(rows).netExpensesCents;
  const names = new Map((db.prepare('SELECT id,name,archived_at FROM categories').all() as { id: string; name: string; archived_at: string | null }[]).map(row => [row.id, row]));
  const ids = [...new Set(rows.filter(row => row.type === 'expense' || row.type === 'refund').map(row => row.category_id!))];
  return { totalNetExpensesCents, rows: ids.map(categoryId => {
    const detail = rows.filter(row => row.category_id === categoryId && (row.type === 'expense' || row.type === 'refund'));
    const netExpensesCents = totals(detail).netExpensesCents, category = names.get(categoryId)!;
    return { categoryId, name: category.name, archivedAt: category.archived_at, netExpensesCents, recordCount: detail.length, percentage: totalNetExpensesCents > 0 ? netExpensesCents / totalNetExpensesCents * 100 : null };
  }).sort((a, b) => a.name.localeCompare(b.name)) };
}
function trends(rows: Transaction[], period: ReturnType<typeof reportPeriod>) {
  const start = Number(period.dateFrom.slice(0, 4)) * 12 + Number(period.dateFrom.slice(5, 7)) - 1;
  const end = Number(period.dateTo.slice(0, 4)) * 12 + Number(period.dateTo.slice(5, 7)) - 1;
  const groups = new Map<string, Transaction[]>();
  for (const row of rows) { const key = row.date.slice(0, 7); if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(row); }
  const result = [];
  for (let index = start; index <= end; index++) {
    const month = yearText(Math.floor(index / 12)) + '-' + String(index % 12 + 1).padStart(2, '0');
    result.push({ month, ...totals(groups.get(month) ?? []) });
  }
  return { rows: result };
}
function balances(db: Database.Database, period: ReturnType<typeof reportPeriod>, accountId?: unknown) {
  if (accountId !== undefined && (typeof accountId !== 'string' || !accountId)) throw badRequest('accountId must be a nonempty string.');
  const rows = [];
  try {
    for (let page = 1; ; page++) {
      const result = listAccounts(db, true, { asOfDate: period.dateTo, page, pageSize: 200 });
      rows.push(...result.items.filter(row => accountId === undefined || row.id === accountId));
      if (page >= result.meta.totalPages) break;
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('safe integer')) throw unprocessable('Report balance exceeds the supported integer-cent range.');
    throw error;
  }
  return { asOfDate: period.dateTo, rows };
}
export function getReport(db: Database.Database, kind: 'categories' | 'trends' | 'balances', query: TransactionFilters) {
  return db.transaction(() => {
    const period = reportPeriod(db, query), all = records(db, { ...query, ...period });
    return { ...period, ...(kind === 'categories' ? categories(db, all) : kind === 'trends' ? trends(all, period) : balances(db, period, query.accountId)) };
  })();
}
export function getInsights(db: Database.Database, query: TransactionFilters) {
  return db.transaction(() => {
    const period = reportPeriod(db, query), all = records(db, { ...query, ...period }), budgets = [];
    for (let year = Number(period.dateFrom.slice(0, 4)); year <= Number(period.dateTo.slice(0, 4)); year++) budgets.push(getBudget(db, year));
    const goals = [], reminders = [];
    for (let page = 1; ; page++) { const result = listGoals(db, { page, pageSize: 200 }); goals.push(...result.items); if (page >= result.meta.totalPages) break; }
    for (let page = 1; ; page++) { const result = listReminders(db, { page, pageSize: 200 }); reminders.push(...result.items); if (page >= result.meta.totalPages) break; }
    return { overview: { ...period, ...totals(all) }, categories: categories(db, all), trends: trends(all, period), balances: balances(db, period, query.accountId), budgets, goals, goalsAsOfDate: getHouseholdToday(db), reminders, remindersAsOfDate: getHouseholdToday(db) };
  })();
}
function priorYear(date: string): string {
  const year = Number(date.slice(0, 4)) - 1;
  if (year < 1) throw badRequest('A previous-year comparison is unavailable before year 0002.');
  const month = Number(date.slice(5, 7)), day = Math.min(Number(date.slice(8, 10)), lastDay(year, month));
  return `${yearText(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
export function getYearComparison(db: Database.Database, query: ReportQuery) {
  return db.transaction(() => {
    const today = getHouseholdToday(db), mode = query.mode ?? 'matched';
    if (mode !== 'matched' && mode !== 'calendar') throw badRequest('Comparison mode must be matched or calendar.');
    let period;
    if (mode === 'calendar') {
      const year = query.year ?? today.slice(0, 4);
      if (typeof year !== 'string' || !/^\d{4}$/.test(year) || Number(year) < 2) throw badRequest('Comparison year must be 0002 through 9999.');
      if (query.dateFrom !== undefined || query.dateTo !== undefined) throw badRequest('Choose a calendar year or explicit matched dates, not both.');
      period = reportPeriod(db, { dateFrom: year + '-01-01', dateTo: year + '-12-31' });
    } else {
      if (query.year !== undefined) throw badRequest('year is only available for calendar comparisons.');
      period = reportPeriod(db, query.dateFrom === undefined && query.dateTo === undefined ? { dateFrom: today.slice(0, 4) + '-01-01', dateTo: today } : query);
    }
    const previous = { dateFrom: priorYear(period.dateFrom), dateTo: priorYear(period.dateTo) };
    return { mode, current: { ...period, ...totals(records(db, { ...query, ...period })) }, previous: { ...previous, ...totals(records(db, { ...query, ...previous })) }, currentYearIncomplete: mode === 'calendar' && period.dateFrom.slice(0, 4) === today.slice(0, 4) && today < period.dateTo };
  })();
}
function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
function decimalCents(value: number): string { const cents = BigInt(value); return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`; }
export function exportTransactions(db: Database.Database, query: TransactionFilters): string {
  return db.transaction(() => {
    // Exports honor the Records filters exactly; an absent date filter means all records.
    const all = records(db, query);
    const accounts = new Map((db.prepare('SELECT id,name FROM accounts').all() as { id: string; name: string }[]).map(row => [row.id, row.name]));
    const cats = new Map((db.prepare('SELECT id,name FROM categories').all() as { id: string; name: string }[]).map(row => [row.id, row.name]));
    return '\uFEFF' + [['date', 'description', 'type', 'amountUsd', 'category', 'account', 'destinationAccount', 'notes'], ...all.map(row => [row.date, row.description, row.type, decimalCents(row.amount_cents), cats.get(row.category_id ?? '') ?? '', accounts.get(row.account_id) ?? '', accounts.get(row.destination_account_id ?? '') ?? '', row.notes])].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  })();
}
