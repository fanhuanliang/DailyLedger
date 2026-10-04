import type { Account, Transaction, BalanceResult } from '../types/domain';
import { NOT_AVAILABLE } from '../types/domain';

function signedMovement(account: Account, transaction: Transaction): number {
  const { type, amount_cents, account_id, destination_account_id } = transaction;
  if (type === 'transfer') {
    if (account_id === account.id) return -amount_cents;
    if (destination_account_id === account.id) return amount_cents;
    return 0;
  }
  if (account_id !== account.id) return 0;
  if (type === 'income' || type === 'refund') return amount_cents;
  return -amount_cents;
}

export function computeAccountBalance(account: Account, transactions: readonly Transaction[], asOfDate: string): BalanceResult {
  if (asOfDate < account.opening_date) return NOT_AVAILABLE;
  let total = account.opening_balance_cents;
  for (const transaction of transactions) {
    if (transaction.date < account.opening_date || transaction.date > asOfDate) continue;
    total += signedMovement(account, transaction);
    if (!Number.isSafeInteger(total)) throw new Error('Computed account balance exceeded the safe integer-cent range.');
  }
  return total;
}
