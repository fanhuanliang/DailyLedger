import { computeNetExpenses, computeIncomeTotal, computeMoneyLeftOver } from '../src/services/periodTotals';
import type { Transaction } from '../src/types/domain';

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'tx-1', date: '2026-01-05', description: 'x', type: 'expense', amount_cents: 1000, account_id: 'acc-1',
    destination_account_id: null, category_id: null, notes: null, source: 'manual', import_batch_id: null,
    occurrence_id: null, revision: 1, created_at: '2026-01-05T00:00:00.000Z', updated_at: '2026-01-05T00:00:00.000Z',
    ...overrides,
  };
}

describe('period totals: spec section 3 net expenses / income / money left over', () => {
  test('AC3: a refund reduces net category spending below the original expense', () => {
    const txs = [
      tx({ id: 't1', type: 'expense', amount_cents: 10000, category_id: 'cat-food' }),
      tx({ id: 't2', type: 'refund', amount_cents: 2000, category_id: 'cat-food' }),
    ];
    expect(computeNetExpenses(txs, 'cat-food')).toBe(8000);
  });

  test('a refund larger than its expense yields a negative net (net refund)', () => {
    const txs = [
      tx({ id: 't1', type: 'expense', amount_cents: 1000 }),
      tx({ id: 't2', type: 'refund', amount_cents: 5000 }),
    ];
    expect(computeNetExpenses(txs)).toBe(-4000);
  });

  test('AC4: transfers never count toward net expenses or income', () => {
    const txs = [tx({ type: 'transfer', amount_cents: 9999 })];
    expect(computeNetExpenses(txs)).toBe(0);
    expect(computeIncomeTotal(txs)).toBe(0);
  });

  test('income total excludes refunds and transfers', () => {
    const txs = [
      tx({ id: 't1', type: 'income', amount_cents: 50000 }),
      tx({ id: 't2', type: 'refund', amount_cents: 2000 }),
      tx({ id: 't3', type: 'transfer', amount_cents: 7000 }),
    ];
    expect(computeIncomeTotal(txs)).toBe(50000);
  });

  test('AC5: money left over is income minus net expenses', () => {
    const txs = [
      tx({ id: 't1', type: 'income', amount_cents: 50000 }),
      tx({ id: 't2', type: 'expense', amount_cents: 20000 }),
    ];
    expect(computeMoneyLeftOver(txs)).toBe(30000);
  });

  test('rejects rather than silently losing precision when an accumulated total would exceed the safe-integer range', () => {
    const txs = [
      tx({ id: 't1', type: 'expense', amount_cents: Number.MAX_SAFE_INTEGER - 5 }),
      tx({ id: 't2', type: 'expense', amount_cents: 1000 }),
    ];
    expect(() => computeNetExpenses(txs)).toThrow();
  });
});

test('money left over rejects an unsafe final result even when component totals are safe', () => {
  const rows = [tx({ type: 'income', amount_cents: Number.MAX_SAFE_INTEGER }), tx({ type: 'refund', amount_cents: 2 })];
  expect(() => computeMoneyLeftOver(rows)).toThrow();
});
