import request from 'supertest';
import { openDatabase } from '../../src/db/connection';
import { createApp } from '../../src/app';

export const MCP_TEST_TOKEN = 'test-token';

export function buildAuthorizedTestApp() {
  const db = openDatabase(':memory:');
  // CRUD tests arrange their own categories on an empty fixture. Real startup seeds
  // are independently verified against openDatabase in schemaConstraints.test.ts.
  db.prepare('DELETE FROM categories').run();
  const instance = createApp(db, { mcpToken: MCP_TEST_TOKEN });
  const base = request.agent(instance);
  const withAuth = (req: ReturnType<typeof base.get>) => req.set('Authorization', `Bearer ${MCP_TEST_TOKEN}`);
  return {
    db,
    agent: {
      get: (url: string) => withAuth(base.get(url)),
      post: (url: string) => withAuth(base.post(url)),
      put: (url: string) => withAuth(base.put(url)),
      patch: (url: string) => withAuth(base.patch(url)),
      delete: (url: string) => withAuth(base.delete(url)),
    },
  };
}
