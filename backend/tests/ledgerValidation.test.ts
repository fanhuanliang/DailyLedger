import { buildAuthorizedTestApp } from './helpers/testApp';

describe('Ledger validation and historical corrections', () => {
  test('rejects invalid date filters and malformed revision values without mutations', async () => {
    const { db, agent } = buildAuthorizedTestApp();
    try {
      for (const query of ['dateFrom=2026-02-31','dateTo=bad','dateFrom=2026-03-01&dateTo=2026-02-01','type=unknown']) {
        expect((await agent.get(`/api/v1/transactions?${query}`)).status).toBe(400);
      }
      const account = (await agent.post('/api/v1/accounts').send({ name: 'Checking', type: 'checking', openingDate: '2026-01-01', openingBalanceCents: 0 })).body.data;
      for (const expectedRevision of [-1,0,Number.MAX_SAFE_INTEGER+1]) {
        expect((await agent.patch(`/api/v1/accounts/${account.id}`).send({ name: 'Wrong', expectedRevision })).status).toBe(400);
      }
      expect(db.prepare('SELECT name,revision FROM accounts WHERE id = ?').get(account.id)).toEqual({ name: 'Checking', revision: 1 });
    } finally { db.close(); }
  });
  test('allows correcting an existing archived account/category reference, while new entries remain rejected', async () => {
    const { db, agent } = buildAuthorizedTestApp();
    try {
      const account = (await agent.post('/api/v1/accounts').send({ name: 'Old checking', type: 'checking', openingDate: '2026-01-01', openingBalanceCents: 0 })).body.data;
      const category = (await agent.post('/api/v1/categories').send({ name: 'Old groceries', kind: 'expense' })).body.data;
      const input = { date: '2026-01-02', description: 'Original', type: 'expense', amountCents: 100, accountId: account.id, categoryId: category.id };
      const record = (await agent.post('/api/v1/transactions').send(input)).body.data;
      await agent.post(`/api/v1/accounts/${account.id}/archive`).send({ expectedRevision: 1 });
      await agent.post(`/api/v1/categories/${category.id}/archive`).send({ expectedRevision: 1 });
      expect((await agent.patch(`/api/v1/transactions/${record.id}`).send({ ...input, description: 'Corrected', expectedRevision: 1 })).status).toBe(200);
      expect((await agent.post('/api/v1/transactions').send(input)).status).toBe(422);
      expect(db.prepare('SELECT description, account_id, category_id FROM transactions WHERE id = ?').get(record.id)).toEqual({ description: 'Corrected', account_id: account.id, category_id: category.id });
      expect(db.prepare('SELECT count(*) AS n FROM transactions').get()).toEqual({ n: 1 });
    } finally { db.close(); }
  });
});
