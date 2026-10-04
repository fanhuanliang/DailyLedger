import { computeAccountBalance } from '../src/services/balances';
import type { Account, Transaction } from '../src/types/domain';

function account(overrides: Partial<Account>): Account {
  return {
    id: 'acc-1', name: 'Checking', type: 'checking', opening_date: '2026-01-01', opening_balance_cents: 100000,
    archived_at: null, revision: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'tx-1', date: '2026-01-05', description: 'x', type: 'expense', amount_cents: 1000, account_id: 'acc-1',
    destination_account_id: null, category_id: null, notes: null, source: 'manual', import_batch_id: null,
    occurrence_id: null, revision: 1, created_at: '2026-01-05T00:00:00.000Z', updated_at: '2026-01-05T00:00:00.000Z',
    ...overrides,
  };
}

describe('computeAccountBalance: spec section 3/4 sign and date rules', () => {
  test('AC5: opening balance plus income minus expense yields the expected total at an inclusive date', () => {
    const acc = account({ opening_balance_cents: 100000 });
    const txs = [
      tx({ id: 't1', type: 'income', amount_cents: 50000, date: '2026-01-10' }),
      tx({ id: 't2', type: 'expense', amount_cents: 20000, date: '2026-01-15' }),
    ];
    expect(computeAccountBalance(acc, txs, '2026-01-15')).toBe(130000);
  });

  test('AC5: a date before opening_date is Not available, never zero', () => {
    const acc = account({ opening_date: '2026-02-01' });
    expect(computeAccountBalance(acc, [], '2026-01-31')).toBe('not_available');
  });

  test('balance at opening_date itself equals the opening balance when no movements exist', () => {
    const acc = account({ opening_date: '2026-01-01', opening_balance_cents: 42 });
    expect(computeAccountBalance(acc, [], '2026-01-01')).toBe(42);
  });

  test('refund increases an ordinary account balance like income', () => {
    const acc = account({ opening_balance_cents: 0 });
    const txs = [tx({ type: 'refund', amount_cents: 2000, date: '2026-01-02' })];
    expect(computeAccountBalance(acc, txs, '2026-01-02')).toBe(2000);
  });

  test('credit card purchases decrease the signed balance (debt becomes more negative)', () => {
    const acc = account({ type: 'credit_card', opening_balance_cents: 0 });
    const txs = [tx({ type: 'expense', amount_cents: 10000, date: '2026-01-02', account_id: 'acc-1' })];
    expect(computeAccountBalance(acc, txs, '2026-01-02')).toBe(-10000);
  });

  test('AC2: a credit card payment (transfer) restores the balance so $100 purchase + $100 payment nets to 0 debt', () => {
    const acc = account({ type: 'credit_card', opening_balance_cents: 0 });
    const txs = [
      tx({ id: 't1', type: 'expense', amount_cents: 10000, date: '2026-01-02', account_id: 'acc-1' }),
      tx({ id: 't2', type: 'transfer', amount_cents: 10000, date: '2026-01-05', account_id: 'checking', destination_account_id: 'acc-1' }),
    ];
    expect(computeAccountBalance(acc, txs, '2026-01-05')).toBe(0);
  });

  test('a transfer subtracts from the source account', () => {
    const acc = account({ opening_balance_cents: 5000 });
    const txs = [tx({ type: 'transfer', amount_cents: 1000, date: '2026-01-02', account_id: 'acc-1', destination_account_id: 'other' })];
    expect(computeAccountBalance(acc, txs, '2026-01-02')).toBe(4000);
  });

  test('movements after the requested date are excluded', () => {
    const acc = account({ opening_balance_cents: 0 });
    const txs = [tx({ type: 'income', amount_cents: 500, date: '2026-02-01' })];
    expect(computeAccountBalance(acc, txs, '2026-01-31')).toBe(0);
  });

  test('rejects rather than silently losing precision when the accumulated balance would exceed the safe-integer range', () => {
    const acc = account({ opening_balance_cents: Number.MAX_SAFE_INTEGER - 5 });
    const txs = [tx({ type: 'income', amount_cents: 1000, date: '2026-01-02' })];
    expect(() => computeAccountBalance(acc, txs, '2026-01-02')).toThrow();
  });
});
