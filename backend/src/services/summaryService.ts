import type Database from 'better-sqlite3';
import { badRequest, unprocessable } from '../lib/errors';
import { getHouseholdToday } from '../lib/householdTime';
import type { Transaction } from '../types/domain';
import { listTransactions, type TransactionFilters } from './transactionsService';
import { computeIncomeTotal, computeNetExpenses, computeMoneyLeftOver } from './periodTotals';

export function getSummary(db: Database.Database, query: TransactionFilters) {
  let dateFrom = query.dateFrom; let dateTo = query.dateTo;
  if (dateFrom === undefined && dateTo === undefined) {
    const today = getHouseholdToday(db);
    dateFrom = today.slice(0,7)+'-01';
    const year = Number(today.slice(0,4)); const month = Number(today.slice(5,7));
    dateTo = today.slice(0,7)+'-'+String(new Date(Date.UTC(year,month,0)).getUTCDate()).padStart(2,'0');
  } else if (dateFrom === undefined || dateTo === undefined) throw badRequest('Supply both dateFrom and dateTo.');
  return db.transaction(() => {
    const records: Transaction[] = [];
    let page = 1;
    while (true) {
      const result = listTransactions(db,{...query,dateFrom,dateTo,page,pageSize:200});
      records.push(...result.items);
      if (page >= result.meta.totalPages) break;
      page++;
    }
    try {
      return {dateFrom,dateTo,incomeCents:computeIncomeTotal(records),netExpensesCents:computeNetExpenses(records),moneyLeftOverCents:computeMoneyLeftOver(records),recordCount:records.length};
    } catch { throw unprocessable('Computed totals exceed the supported integer-cent range.'); }
  })();
}
