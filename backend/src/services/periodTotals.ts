import type { Transaction } from '../types/domain';

function matches(transaction: Transaction, categoryId?: string): boolean {
  return categoryId === undefined || transaction.category_id === categoryId;
}

function assertSafeTotal(total: number): number {
  if (!Number.isSafeInteger(total)) throw new Error('Computed total exceeded the safe integer-cent range.');
  return total;
}

export function computeNetExpenses(transactions: readonly Transaction[], categoryId?: string): number {
  let total = 0;
  for (const transaction of transactions) {
    if (!matches(transaction, categoryId)) continue;
    if (transaction.type === 'expense') total += transaction.amount_cents;
    else if (transaction.type === 'refund') total -= transaction.amount_cents;
    assertSafeTotal(total);
  }
  return total;
}

export function computeIncomeTotal(transactions: readonly Transaction[], categoryId?: string): number {
  let total = 0;
  for (const transaction of transactions) {
    if (!matches(transaction, categoryId)) continue;
    if (transaction.type === 'income') total += transaction.amount_cents;
    assertSafeTotal(total);
  }
  return total;
}

export function computeMoneyLeftOver(transactions: readonly Transaction[]): number {
  return assertSafeTotal(computeIncomeTotal(transactions) - computeNetExpenses(transactions));
}
