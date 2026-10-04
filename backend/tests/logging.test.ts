import request from 'supertest';
import { openDatabase } from '../src/db/connection';
import { createApp } from '../src/app';
import { buildAuthorizedTestApp } from './helpers/testApp';

describe('Logging and error sanitization: no financial data or raw error content in logs', () => {
  test('logs the request path without the query string, even when it carries search text', async () => {
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const { agent } = buildAuthorizedTestApp();
      await agent.get('/api/v1/transactions?text=my-secret-salary-search&categoryId=cat-1');
      const logged = infoSpy.mock.calls.map((call) => String(call[0]));
      expect(logged.some((line) => line.includes('my-secret-salary-search'))).toBe(false);
      expect(logged.some((line) => line.includes('/api/v1/transactions') && !line.includes('?'))).toBe(true);
    } finally {
      infoSpy.mockRestore();
    }
  });

  test('a malformed JSON body returns a sanitized 400 instead of a 500, and logs nothing from the body', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const db = openDatabase(':memory:');
      const response = await request(createApp(db, { mcpToken: 'tok' }))
        .post('/api/v1/categories')
        .set('Authorization', 'Bearer tok')
        .set('Content-Type', 'application/json')
        .send('{"name": "secret-category", invalid json here');
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('BAD_REQUEST');
      const loggedText = errorSpy.mock.calls.map((call) => call.join(' ')).join(' ');
      expect(loggedText).not.toContain('secret-category');
      expect(loggedText).not.toContain('invalid json here');
    } finally {
      errorSpy.mockRestore();
    }
  });

  test('an unexpected server error is logged generically, never echoing the underlying error message', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const db = openDatabase(':memory:');
      const app = createApp(db, { mcpToken: 'tok' });
      db.close();
      const response = await request(app).get('/api/v1/accounts').set('Authorization', 'Bearer tok');
      expect(response.status).toBe(500);
      const loggedText = errorSpy.mock.calls.map((call) => call.join(' ')).join(' ');
      expect(loggedText).not.toMatch(/database connection|SQLITE|closed/i);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
