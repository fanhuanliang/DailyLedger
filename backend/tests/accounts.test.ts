import { buildAuthorizedTestApp } from './helpers/testApp';

describe('Accounts API: AC5 opening balance and archive/revision rules', () => {
  const app = buildAuthorizedTestApp;

  test('creates a checking account and returns it with revision 1', async () => {
    const { agent } = app();
    const response = await agent.post('/api/v1/accounts').send({ name: 'Checking', type: 'checking', openingDate: '2026-01-01', openingBalanceCents: 100000 });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ name: 'Checking', type: 'checking', opening_balance_cents: 100000, revision: 1, archived_at: null });
  });

  test('rejects a non-integer or unsafe-overflow openingBalanceCents with 400', async () => {
    const { agent } = app();
    for (const openingBalanceCents of [12.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
      const response = await agent.post('/api/v1/accounts').send({ name: 'Bad', type: 'checking', openingDate: '2026-01-01', openingBalanceCents });
      expect(response.status).toBe(400);
    }
  });

  test('rejects a calendar-invalid openingDate (e.g. Feb 31) with 400 rather than accepting it', async () => {
    const { agent } = app();
    const response = await agent.post('/api/v1/accounts').send({ name: 'Bad date', type: 'checking', openingDate: '2026-02-31', openingBalanceCents: 0 });
    expect(response.status).toBe(400);
    expect(response.body.error.fields.openingDate).toBe('invalid');
  });

  test('a PATCH with a null name returns 400 instead of crashing with a 500', async () => {
    const { agent } = app();
    const created = await agent.post('/api/v1/accounts').send({ name: 'Checking', type: 'checking', openingDate: '2026-01-01', openingBalanceCents: 0 });
    const response = await agent.patch(`/api/v1/accounts/${created.body.data.id}`).send({ name: null, expectedRevision: 1 });
    expect(response.status).toBe(400);
  });

  test('a PATCH with a numeric name returns 400 instead of crashing with a 500', async () => {
    const { agent } = app();
    const created = await agent.post('/api/v1/accounts').send({ name: 'Checking', type: 'checking', openingDate: '2026-01-01', openingBalanceCents: 0 });
    const response = await agent.patch(`/api/v1/accounts/${created.body.data.id}`).send({ name: 12345, expectedRevision: 1 });
    expect(response.status).toBe(400);
  });

  test('rejects an unknown account type with 400', async () => {
    const { agent } = app();
    const response = await agent.post('/api/v1/accounts').send({ name: 'Weird', type: 'bitcoin', openingDate: '2026-01-01', openingBalanceCents: 0 });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BAD_REQUEST');
  });

  test('a credit card opening balance is stored signed (negative represents debt)', async () => {
    const { agent } = app();
    const response = await agent.post('/api/v1/accounts').send({ name: 'Visa', type: 'credit_card', openingDate: '2026-01-01', openingBalanceCents: -50000 });
    expect(response.status).toBe(201);
    expect(response.body.data.opening_balance_cents).toBe(-50000);
  });

  test('archiving requires a matching expectedRevision and returns 409 when stale', async () => {
    const { agent } = app();
    const created = await agent.post('/api/v1/accounts').send({ name: 'Cash', type: 'cash', openingDate: '2026-01-01', openingBalanceCents: 0 });
    const id = created.body.data.id;
    const stale = await agent.post(`/api/v1/accounts/${id}/archive`).send({ expectedRevision: 99 });
    expect(stale.status).toBe(409);
    const ok = await agent.post(`/api/v1/accounts/${id}/archive`).send({ expectedRevision: 1 });
    expect(ok.status).toBe(200);
    expect(ok.body.data.archived_at).not.toBeNull();
    expect(ok.body.data.revision).toBe(2);
  });

  test('AC15: a stale edit after a concurrent update returns 409 and does not overwrite the newer value', async () => {
    const { agent } = app();
    const created = await agent.post('/api/v1/accounts').send({ name: 'Savings', type: 'savings', openingDate: '2026-01-01', openingBalanceCents: 1000 });
    const id = created.body.data.id;
    const firstEdit = await agent.patch(`/api/v1/accounts/${id}`).send({ name: 'Savings A', openingDate: '2026-01-01', openingBalanceCents: 1000, expectedRevision: 1 });
    expect(firstEdit.status).toBe(200);
    const staleEdit = await agent.patch(`/api/v1/accounts/${id}`).send({ name: 'Savings B', openingDate: '2026-01-01', openingBalanceCents: 1000, expectedRevision: 1 });
    expect(staleEdit.status).toBe(409);
    const refetched = await agent.get(`/api/v1/accounts/${id}`);
    expect(refetched.body.data.name).toBe('Savings A');
  });

  test('rejects moving the opening date later than an existing transaction instead of silently excluding it from history', async () => {
    const { agent } = app();
    const created = await agent.post('/api/v1/accounts').send({ name: 'Checking', type: 'checking', openingDate: '2026-01-01', openingBalanceCents: 0 });
    const id = created.body.data.id;
    const category = await agent.post('/api/v1/categories').send({ name: 'Groceries', kind: 'expense' });
    await agent.post('/api/v1/transactions').send({ date: '2026-01-05', description: 'Milk', type: 'expense', amountCents: 500, accountId: id, categoryId: category.body.data.id });

    const response = await agent.patch(`/api/v1/accounts/${id}`).send({ openingDate: '2026-01-10', openingBalanceCents: 0, expectedRevision: 1 });
    expect(response.status).toBe(422);
    expect(response.body.error.fields.openingDate).toBe('excludes_existing_history');

    const unchanged = await agent.get(`/api/v1/accounts/${id}`);
    expect(unchanged.body.data.opening_date).toBe('2026-01-01');
    expect(unchanged.body.data.revision).toBe(1);
  });

  test('allows moving the opening date earlier than existing transactions', async () => {
    const { agent } = app();
    const created = await agent.post('/api/v1/accounts').send({ name: 'Checking', type: 'checking', openingDate: '2026-01-05', openingBalanceCents: 0 });
    const id = created.body.data.id;
    const response = await agent.patch(`/api/v1/accounts/${id}`).send({ openingDate: '2026-01-01', openingBalanceCents: 0, expectedRevision: 1 });
    expect(response.status).toBe(200);
    expect(response.body.data.opening_date).toBe('2026-01-01');
  });

  test('archived accounts remain listed when includeArchived=true and are excluded by default', async () => {
    const { agent } = app();
    const created = await agent.post('/api/v1/accounts').send({ name: 'Old', type: 'cash', openingDate: '2026-01-01', openingBalanceCents: 0 });
    await agent.post(`/api/v1/accounts/${created.body.data.id}/archive`).send({ expectedRevision: 1 });
    const defaultList = await agent.get('/api/v1/accounts');
    expect(defaultList.body.data).toHaveLength(0);
    const fullList = await agent.get('/api/v1/accounts?includeArchived=true');
    expect(fullList.body.data).toHaveLength(1);
  });
});
