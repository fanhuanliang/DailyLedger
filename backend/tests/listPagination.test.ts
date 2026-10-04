import { buildAuthorizedTestApp } from './helpers/testApp';
import { createAccount, archiveAccount } from '../src/services/accountsService';
import { createCategory } from '../src/services/categoriesService';

describe('Account and category pagination contract', () => {
  test('accounts default to 50 rows and include stable page metadata, with archive filtering', async () => {
    const { db, agent } = buildAuthorizedTestApp();
    try {
      for (let index = 0; index < 55; index++) {
        const account = createAccount(db, { name: `Account ${String(index).padStart(3, '0')}`, type: 'cash', openingDate: '2026-01-01', openingBalanceCents: 0 });
        if (index === 54) archiveAccount(db, account.id, account.revision);
      }
      const first = await agent.get('/api/v1/accounts');
      expect(first.body.data).toHaveLength(50);
      expect(first.body.meta).toEqual({ page: 1, pageSize: 50, total: 54, totalPages: 2 });
      const second = await agent.get('/api/v1/accounts?page=2');
      expect(second.body.data.map((row: { name: string }) => row.name)).toEqual(['Account 050', 'Account 051', 'Account 052', 'Account 053']);
      const archived = await agent.get('/api/v1/accounts?includeArchived=true&page=2');
      expect(archived.body.data).toHaveLength(5);
      expect(archived.body.meta.total).toBe(55);
    } finally { db.close(); }
  });

  test('categories return subsequent pages and enforce the list request limits', async () => {
    const { db, agent } = buildAuthorizedTestApp();
    try {
      for (let index = 0; index < 55; index++) createCategory(db, { name: `Category ${String(index).padStart(3, '0')}`, kind: 'expense' });
      const response = await agent.get('/api/v1/categories?page=2');
      expect(response.body.data).toHaveLength(5);
      expect(response.body.meta).toEqual({ page: 2, pageSize: 50, total: 55, totalPages: 2 });
      for (const resource of ['accounts', 'categories']) {
        for (const query of ['pageSize=201', 'page=0', 'page=2&page=3', 'includeArchived=true&includeArchived=false', 'includeArchived=maybe']) {
          expect((await agent.get(`/api/v1/${resource}?${query}`)).status).toBe(400);
        }
      }
    } finally { db.close(); }
  });
});
