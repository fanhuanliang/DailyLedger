import { buildAuthorizedTestApp } from './helpers/testApp';

describe('Accounts API derived balances and inclusive date boundary', () => {
  test('AC5: lists balance from opening, income and expenses, and before opening is unavailable', async () => {
    const { db, agent } = buildAuthorizedTestApp();
    try {
      const account = (await agent.post('/api/v1/accounts').send({ name: 'Checking', type: 'checking', openingDate: '2026-01-01', openingBalanceCents: 100000 })).body.data;
      const income = (await agent.post('/api/v1/categories').send({ name: 'Pay', kind: 'income' })).body.data;
      const expense = (await agent.post('/api/v1/categories').send({ name: 'Bills', kind: 'expense' })).body.data;
      for (const [type, amountCents, categoryId] of [['income', 50000, income.id], ['expense', 20000, expense.id]]) {
        expect((await agent.post('/api/v1/transactions').send({ date: '2026-01-02', description: type, type, amountCents, accountId: account.id, categoryId })).status).toBe(201);
      }
      const result = await agent.get('/api/v1/accounts?asOfDate=2026-01-02');
      expect(result.body.data[0]).toMatchObject({ balance_cents: 130000, balance_as_of: '2026-01-02', opening_balance_cents: 100000 });
      const before = await agent.get('/api/v1/accounts?asOfDate=2025-12-31');
      expect(before.body.data[0].balance_cents).toBe('not_available');
      expect((await agent.get('/api/v1/accounts?asOfDate=2026-02-31')).status).toBe(400);
    } finally { db.close(); }
  });
});
