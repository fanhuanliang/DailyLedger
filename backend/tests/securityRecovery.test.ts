import request from 'supertest';
import { openDatabase } from '../src/db/connection';
import { createApp } from '../src/app';

const origin = 'http://127.0.0.1:5173';

describe('Browser session recovery and bounded security state', () => {
  afterEach(() => jest.restoreAllMocks());

  test('token initialization rejects a foreign Origin without creating a session', async () => {
    const db = openDatabase(':memory:');
    const originalCategoryCount = db.prepare('SELECT count(*) AS n FROM categories').get();
    try {
      const response = await request(createApp(db, { appOrigin: origin }))
        .get('/api/v1/csrf-token').set('Origin', 'https://foreign.example');
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('CROSS_SITE_BLOCKED');
      expect(response.headers['set-cookie']).toBeUndefined();
    } finally { db.close(); }
  });

  test('tokens are never cacheable and malformed session cookies can initialize safely', async () => {
    const db = openDatabase(':memory:');
    const originalCategoryCount = db.prepare('SELECT count(*) AS n FROM categories').get();
    try {
      const response = await request(createApp(db)).get('/api/v1/csrf-token').set('Cookie', 'dl_session=%E0%A4%A');
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(typeof response.body.data.csrfToken).toBe('string');
      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies[0]).toContain('HttpOnly');
      expect(cookies[0]).toContain('SameSite=Lax');
    } finally { db.close(); }
  });

  test('a session expires after 24 hours and rejects writes without changing the ledger', async () => {
    const db = openDatabase(':memory:');
    const originalCategoryCount = db.prepare('SELECT count(*) AS n FROM categories').get();
    let now = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const agent = request.agent(createApp(db));
      const token = (await agent.get('/api/v1/csrf-token')).body.data.csrfToken;
      now += 24 * 60 * 60 * 1000 + 1;
      const response = await agent.post('/api/v1/categories').set('X-CSRF-Token', token).send({ name: 'Expired', kind: 'expense' });
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('CSRF_REQUIRED');
      expect(db.prepare('SELECT count(*) AS n FROM categories').get()).toEqual(originalCategoryCount);
    } finally { db.close(); }
  });

  test('session storage evicts the oldest session when 1000 newer sessions exist', async () => {
    const db = openDatabase(':memory:');
    const originalCategoryCount = db.prepare('SELECT count(*) AS n FROM categories').get();
    try {
      const app = createApp(db);
      const oldest = request.agent(app);
      const token = (await oldest.get('/api/v1/csrf-token')).body.data.csrfToken;
      for (let index = 0; index < 1000; index++) await request(app).get('/api/v1/csrf-token');
      const response = await oldest.post('/api/v1/categories').set('X-CSRF-Token', token).send({ name: 'Evicted', kind: 'expense' });
      expect(response.status).toBe(403);
      expect(db.prepare('SELECT count(*) AS n FROM categories').get()).toEqual(originalCategoryCount);
    } finally { db.close(); }
  });
});
