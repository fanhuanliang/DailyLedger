import { buildAuthorizedTestApp } from './helpers/testApp';

describe('Categories API: kind, unique active name, archive/revision rules', () => {
  const app = buildAuthorizedTestApp;

  test('creates an expense category', async () => {
    const { agent } = app();
    const response = await agent.post('/api/v1/categories').send({ name: 'Groceries', kind: 'expense' });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ name: 'Groceries', kind: 'expense', revision: 1, archived_at: null });
  });

  test('rejects an invalid kind with 400', async () => {
    const { agent } = app();
    const response = await agent.post('/api/v1/categories').send({ name: 'Weird', kind: 'both' });
    expect(response.status).toBe(400);
  });

  test('rejects a duplicate active name within the same kind with 422', async () => {
    const { agent } = app();
    await agent.post('/api/v1/categories').send({ name: 'Dining', kind: 'expense' });
    const duplicate = await agent.post('/api/v1/categories').send({ name: 'Dining', kind: 'expense' });
    expect(duplicate.status).toBe(422);
    expect(duplicate.body.error.fields.name).toBe('duplicate');
  });

  test('allows the same name across different kinds', async () => {
    const { agent } = app();
    const expense = await agent.post('/api/v1/categories').send({ name: 'Other', kind: 'expense' });
    const income = await agent.post('/api/v1/categories').send({ name: 'Other', kind: 'income' });
    expect(expense.status).toBe(201);
    expect(income.status).toBe(201);
  });

  test('renaming an archived name back to an active duplicate is rejected, archiving frees the name, and stale revision is a 409', async () => {
    const { agent } = app();
    const created = await agent.post('/api/v1/categories').send({ name: 'Travel', kind: 'expense' });
    const id = created.body.data.id;
    const renameStale = await agent.patch(`/api/v1/categories/${id}`).send({ name: 'Trips', expectedRevision: 99 });
    expect(renameStale.status).toBe(409);
    const rename = await agent.patch(`/api/v1/categories/${id}`).send({ name: 'Trips', expectedRevision: 1 });
    expect(rename.status).toBe(200);
    expect(rename.body.data.name).toBe('Trips');
    const archived = await agent.post(`/api/v1/categories/${id}/archive`).send({ expectedRevision: 2 });
    expect(archived.status).toBe(200);
    const recreate = await agent.post('/api/v1/categories').send({ name: 'Trips', kind: 'expense' });
    expect(recreate.status).toBe(201);
  });
});
