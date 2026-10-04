import { buildAuthorizedTestApp } from './helpers/testApp';

describe('Transactions API: validation, transfers, balances, filters, revisions', () => {
  const app = buildAuthorizedTestApp;

  async function seedAccounts(agent: ReturnType<typeof buildAuthorizedTestApp>['agent']) {
    const checking = await agent.post('/api/v1/accounts').send({ name: 'Checking', type: 'checking', openingDate: '2026-01-01', openingBalanceCents: 100000 });
    const card = await agent.post('/api/v1/accounts').send({ name: 'Visa', type: 'credit_card', openingDate: '2026-01-01', openingBalanceCents: 0 });
    return { checkingId: checking.body.data.id, cardId: card.body.data.id };
  }

  async function seedExpenseCategory(agent: ReturnType<typeof buildAuthorizedTestApp>['agent'], name = 'Dining') {
    const category = await agent.post('/api/v1/categories').send({ name, kind: 'expense' });
    return category.body.data.id as string;
  }

  test('rejects zero, negative, non-integer, and unsafe-integer-overflow amountCents with 400', async () => {
    const { agent } = app();
    const { checkingId } = await seedAccounts(agent);
    const categoryId = await seedExpenseCategory(agent);
    for (const amountCents of [0, -500, 12.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      const response = await agent.post('/api/v1/transactions').send({
        date: '2026-01-05', description: 'Bad amount', type: 'expense', amountCents, accountId: checkingId, categoryId,
      });
      expect(response.status).toBe(400);
    }
  });

  test('rejects an archived category for a new transaction with 422, while historical transactions keep showing its name via the lookup list', async () => {
    const { agent } = app();
    const { checkingId } = await seedAccounts(agent);
    const category = await agent.post('/api/v1/categories').send({ name: 'Hobbies', kind: 'expense' });
    const categoryId = category.body.data.id as string;
    await agent.post(`/api/v1/categories/${categoryId}/archive`).send({ expectedRevision: 1 });

    const response = await agent.post('/api/v1/transactions').send({
      date: '2026-01-05', description: 'Blocked', type: 'expense', amountCents: 500, accountId: checkingId, categoryId,
    });
    expect(response.status).toBe(422);
    expect(response.body.error.fields.categoryId).toBe('archived');

    const categories = await agent.get('/api/v1/categories?includeArchived=true');
    expect(categories.body.data.find((c: { id: string }) => c.id === categoryId).name).toBe('Hobbies');
  });

  test('rejects a calendar-invalid date (e.g. Feb 31) with 400 rather than accepting it', async () => {
    const { agent } = app();
    const { checkingId } = await seedAccounts(agent);
    const categoryId = await seedExpenseCategory(agent);
    const response = await agent.post('/api/v1/transactions').send({
      date: '2026-02-31', description: 'Bad date', type: 'expense', amountCents: 500, accountId: checkingId, categoryId,
    });
    expect(response.status).toBe(400);
    expect(response.body.error.fields.date).toBe('invalid');
  });

  test('rejects a numeric notes value with 400 instead of crashing with a 500', async () => {
    const { agent } = app();
    const { checkingId } = await seedAccounts(agent);
    const categoryId = await seedExpenseCategory(agent);
    const response = await agent.post('/api/v1/transactions').send({
      date: '2026-01-05', description: 'Weird notes', type: 'expense', amountCents: 500, accountId: checkingId, categoryId, notes: 12345,
    });
    expect(response.status).toBe(400);
  });

  test('rejects an object accountId with 400 instead of crashing the database driver with a 500', async () => {
    const { agent } = app();
    const categoryId = await seedExpenseCategory(agent);
    const response = await agent.post('/api/v1/transactions').send({
      date: '2026-01-05', description: 'Weird account', type: 'expense', amountCents: 500, accountId: { nested: true }, categoryId,
    });
    expect(response.status).toBe(400);
  });

  test('rejects a transaction dated before the account opening date', async () => {
    const { agent } = app();
    const { checkingId } = await seedAccounts(agent);
    const categoryId = await seedExpenseCategory(agent);
    const response = await agent.post('/api/v1/transactions').send({
      date: '2025-12-31', description: 'Too early', type: 'expense', amountCents: 500, accountId: checkingId, categoryId,
    });
    expect(response.status).toBe(422);
    expect(response.body.error.fields.date).toBe('before_opening_date');
  });

  test('rejects a transfer to the same account and a transfer with a category', async () => {
    const { agent } = app();
    const { checkingId } = await seedAccounts(agent);
    const sameAccount = await agent.post('/api/v1/transactions').send({
      date: '2026-01-05', description: 'Self transfer', type: 'transfer', amountCents: 100, accountId: checkingId, destinationAccountId: checkingId,
    });
    expect(sameAccount.status).toBe(400);

    const { cardId } = await seedAccounts(agent);
    const categoryId = await seedExpenseCategory(agent);
    const withCategory = await agent.post('/api/v1/transactions').send({
      date: '2026-01-05', description: 'Payment', type: 'transfer', amountCents: 100, accountId: checkingId, destinationAccountId: cardId, categoryId,
    });
    expect(withCategory.status).toBe(400);
  });

  test('rejects new entries against an archived account', async () => {
    const { agent } = app();
    const { checkingId } = await seedAccounts(agent);
    const categoryId = await seedExpenseCategory(agent);
    await agent.post(`/api/v1/accounts/${checkingId}/archive`).send({ expectedRevision: 1 });
    const response = await agent.post('/api/v1/transactions').send({
      date: '2026-01-05', description: 'Blocked', type: 'expense', amountCents: 500, accountId: checkingId, categoryId,
    });
    expect(response.status).toBe(422);
    expect(response.body.error.fields.accountId).toBe('archived');
  });

  test('AC2: a $100 purchase and a $100 card payment report $100 of net expenses, not $200', async () => {
    const { agent } = app();
    const { checkingId, cardId } = await seedAccounts(agent);
    const categoryId = await seedExpenseCategory(agent);
    await agent.post('/api/v1/transactions').send({ date: '2026-01-05', description: 'Shopping', type: 'expense', amountCents: 10000, accountId: cardId, categoryId });
    await agent.post('/api/v1/transactions').send({ date: '2026-01-10', description: 'Card payment', type: 'transfer', amountCents: 10000, accountId: checkingId, destinationAccountId: cardId });
    const list = await agent.get('/api/v1/transactions');
    const expenseTotal = list.body.data.filter((t: { type: string }) => t.type === 'expense').reduce((sum: number, t: { amount_cents: number }) => sum + t.amount_cents, 0);
    const transferTotal = list.body.data.filter((t: { type: string }) => t.type === 'transfer').length;
    expect(expenseTotal).toBe(10000);
    expect(transferTotal).toBe(1);
  });

  test('AC3: a refund reduces net category spending and increases the receiving account balance', async () => {
    const { agent } = app();
    const { checkingId } = await seedAccounts(agent);
    const categoryId = await seedExpenseCategory(agent);
    await agent.post('/api/v1/transactions').send({ date: '2026-01-05', description: 'Purchase', type: 'expense', amountCents: 10000, accountId: checkingId, categoryId });
    await agent.post('/api/v1/transactions').send({ date: '2026-01-06', description: 'Refund', type: 'refund', amountCents: 2000, accountId: checkingId, categoryId });
    const list = await agent.get('/api/v1/transactions');
    const net = list.body.data.reduce((sum: number, t: { type: string; amount_cents: number }) => (t.type === 'expense' ? sum + t.amount_cents : t.type === 'refund' ? sum - t.amount_cents : sum), 0);
    expect(net).toBe(8000);
  });

  test('AC4: a transfer moves money between two accounts without a category', async () => {
    const { agent } = app();
    const { checkingId, cardId } = await seedAccounts(agent);
    const response = await agent.post('/api/v1/transactions').send({ date: '2026-01-05', description: 'Move', type: 'transfer', amountCents: 5000, accountId: checkingId, destinationAccountId: cardId });
    expect(response.status).toBe(201);
    expect(response.body.data.category_id).toBeNull();
    expect(response.body.data.destination_account_id).toBe(cardId);
  });

  test('AC15: editing a transaction with a stale revision returns 409 and leaves the newer edit intact', async () => {
    const { agent } = app();
    const { checkingId } = await seedAccounts(agent);
    const categoryId = await seedExpenseCategory(agent);
    const created = await agent.post('/api/v1/transactions').send({ date: '2026-01-05', description: 'Original', type: 'expense', amountCents: 500, accountId: checkingId, categoryId });
    const id = created.body.data.id;
    const firstEdit = await agent.patch(`/api/v1/transactions/${id}`).send({ date: '2026-01-05', description: 'Edited once', type: 'expense', amountCents: 500, accountId: checkingId, categoryId, expectedRevision: 1 });
    expect(firstEdit.status).toBe(200);
    const staleEdit = await agent.patch(`/api/v1/transactions/${id}`).send({ date: '2026-01-05', description: 'Stale edit', type: 'expense', amountCents: 500, accountId: checkingId, categoryId, expectedRevision: 1 });
    expect(staleEdit.status).toBe(409);
    const refetched = await agent.get(`/api/v1/transactions/${id}`);
    expect(refetched.body.data.description).toBe('Edited once');
  });

  test('deletion requires a matching expectedRevision and removes the record', async () => {
    const { agent } = app();
    const { checkingId } = await seedAccounts(agent);
    const categoryId = await seedExpenseCategory(agent);
    const created = await agent.post('/api/v1/transactions').send({ date: '2026-01-05', description: 'Temp', type: 'expense', amountCents: 500, accountId: checkingId, categoryId });
    const id = created.body.data.id;
    const staleDelete = await agent.delete(`/api/v1/transactions/${id}`).send({ expectedRevision: 99 });
    expect(staleDelete.status).toBe(409);
    const okDelete = await agent.delete(`/api/v1/transactions/${id}`).send({ expectedRevision: 1 });
    expect(okDelete.status).toBe(204);
    const missing = await agent.get(`/api/v1/transactions/${id}`);
    expect(missing.status).toBe(404);
  });

  test('ordinary edits cannot change source metadata away from manual', async () => {
    const { agent } = app();
    const { checkingId } = await seedAccounts(agent);
    const categoryId = await seedExpenseCategory(agent);
    const created = await agent.post('/api/v1/transactions').send({ date: '2026-01-05', description: 'Manual', type: 'expense', amountCents: 500, accountId: checkingId, categoryId, source: 'mcp', occurrenceId: 'occ-1' });
    expect(created.body.data.source).toBe('manual');
    const edited = await agent.patch(`/api/v1/transactions/${created.body.data.id}`).send({ date: '2026-01-05', description: 'Manual edit', type: 'expense', amountCents: 500, accountId: checkingId, categoryId, source: 'mcp', expectedRevision: 1 });
    expect(edited.body.data.source).toBe('manual');
  });

  test('filters by account, category, type, date range, and text; paginates and sorts newest-first', async () => {
    const { agent } = app();
    const { checkingId } = await seedAccounts(agent);
    const categoryId = await seedExpenseCategory(agent);
    const other = await seedExpenseCategory(agent, 'Utilities');
    await agent.post('/api/v1/transactions').send({ date: '2026-01-01', description: 'Coffee shop', type: 'expense', amountCents: 500, accountId: checkingId, categoryId });
    await agent.post('/api/v1/transactions').send({ date: '2026-01-15', description: 'Electric bill', type: 'expense', amountCents: 7000, accountId: checkingId, categoryId: other });
    const incomeCategory = await agent.post('/api/v1/categories').send({ name: 'Salary', kind: 'income' });
    const incomeCategoryId = incomeCategory.body.data.id as string;
    await agent.post('/api/v1/transactions').send({ date: '2026-01-20', description: 'Salary', type: 'income', amountCents: 500000, accountId: checkingId, categoryId: incomeCategoryId });

    const byCategory = await agent.get(`/api/v1/transactions?categoryId=${categoryId}`);
    expect(byCategory.body.data).toHaveLength(1);

    const byType = await agent.get('/api/v1/transactions?type=income');
    expect(byType.body.data).toHaveLength(1);

    const byDateRange = await agent.get('/api/v1/transactions?dateFrom=2026-01-10&dateTo=2026-01-16');
    expect(byDateRange.body.data).toHaveLength(1);
    expect(byDateRange.body.data[0].description).toBe('Electric bill');

    const byText = await agent.get('/api/v1/transactions?text=coffee');
    expect(byText.body.data).toHaveLength(1);

    const sorted = await agent.get('/api/v1/transactions');
    expect(sorted.body.data.map((t: { date: string }) => t.date)).toEqual(['2026-01-20', '2026-01-15', '2026-01-01']);
    expect(sorted.body.meta).toMatchObject({ page: 1, pageSize: 50, total: 3 });

    const paged = await agent.get('/api/v1/transactions?page=1&pageSize=2');
    expect(paged.body.data).toHaveLength(2);
    expect(paged.body.meta.totalPages).toBe(2);
  });
});
