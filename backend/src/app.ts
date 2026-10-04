import express from 'express';
import type Database from 'better-sqlite3';

export function createApp(db: Database.Database) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/api/v1/health', (_req, res) => {
    try {
      db.prepare('SELECT currency FROM settings WHERE id = 1').get();
      res.json({ data: { status: 'ready' } });
    } catch {
      res.status(503).json({ error: { code: 'NOT_READY', message: 'Service is not ready.' } });
    }
  });
  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found.' } }));
  return app;
}
