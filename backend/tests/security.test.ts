import request from 'supertest';
import { openDatabase } from '../src/db/connection';
import { createApp } from '../src/app';

const APP_ORIGIN = 'http://127.0.0.1:5173';

describe('Write security: same-origin browser sessions, CSRF tokens, and MCP bearer tokens', () => {
  function app() {
    const db = openDatabase(':memory:');
    return { db, instance: createApp(db, { appOrigin: APP_ORIGIN, mcpToken: 'mcp-secret' }) };
  }

  test('a browser write without a CSRF token is rejected', async () => {
    const { instance } = app();
    const response = await request(instance).post('/api/v1/categories').set('Origin', APP_ORIGIN).send({ name: 'Test groceries', kind: 'expense' });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_REQUIRED');
  });

  test('a cross-site Origin is rejected even for reads', async () => {
    const { instance } = app();
    const response = await request(instance).get('/api/v1/accounts').set('Origin', 'https://evil.example');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CROSS_SITE_BLOCKED');
  });

  test('a same-origin session that fetches a CSRF token can write, and a mismatched token is rejected', async () => {
    const { instance } = app();
    const agent = request.agent(instance);
    const tokenResponse = await agent.get('/api/v1/csrf-token').set('Origin', APP_ORIGIN);
    const csrfToken = tokenResponse.body.data.csrfToken;
    expect(typeof csrfToken).toBe('string');

    const wrongToken = await agent.post('/api/v1/categories').set('Origin', APP_ORIGIN).set('X-CSRF-Token', 'wrong').send({ name: 'Test groceries', kind: 'expense' });
    expect(wrongToken.status).toBe(403);

    const authorized = await agent.post('/api/v1/categories').set('Origin', APP_ORIGIN).set('X-CSRF-Token', csrfToken).send({ name: 'Test groceries', kind: 'expense' });
    expect(authorized.status).toBe(201);
  });

  test('an MCP bearer token can write without a CSRF token or Origin header', async () => {
    const { instance } = app();
    const response = await request(instance).post('/api/v1/categories').set('Authorization', 'Bearer mcp-secret').send({ name: 'Test salary', kind: 'income' });
    expect(response.status).toBe(201);
  });

  test('an invalid bearer token is not treated as MCP-authorized and still requires CSRF', async () => {
    const { instance } = app();
    const response = await request(instance).post('/api/v1/categories').set('Authorization', 'Bearer wrong-token').send({ name: 'Test salary', kind: 'income' });
    expect(response.status).toBe(403);
  });

  test('health remains reachable without Origin, session, or CSRF', async () => {
    const { instance } = app();
    const response = await request(instance).get('/api/v1/health');
    expect(response.status).toBe(200);
  });
});
