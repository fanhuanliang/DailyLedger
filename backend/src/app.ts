import { goalsRouter } from './routes/goals';
import { budgetsRouter } from './routes/budgets';
import { reportsRouter } from './routes/reports';
import { importsRouter } from './routes/imports';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';
import { requestLog } from './middleware/requestLog';
import { SecurityContext } from './middleware/security';
import { ApiError, isBodyParserSyntaxError } from './lib/errors';
import { accountsRouter } from './routes/accounts';
import { categoriesRouter } from './routes/categories';
import { transactionsRouter } from './routes/transactions';
import { settingsRouter } from './routes/settings';

export interface AppOptions {
  appOrigin?: string;
  mcpToken?: string;
  secureCookies?: boolean;
}

export function createApp(db: Database.Database, options: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  app.use(requestLog);

  app.get('/api/v1/health', (_req, res) => {
    try {
      db.prepare('SELECT currency FROM settings WHERE id = 1').get();
      res.json({ data: { status: 'ready' } });
    } catch {
      res.status(503).json({ error: { code: 'NOT_READY', message: 'Service is not ready.' } });
    }
  });

  const security = new SecurityContext({
    appOrigin: options.appOrigin ?? 'http://127.0.0.1:5173',
    mcpToken: options.mcpToken,
    secureCookies: options.secureCookies,
  });

  app.get('/api/v1/csrf-token', security.csrfTokenHandler);
  app.use('/api/v1', security.guard);
  app.use('/api/v1/goals', goalsRouter(db));
  app.use('/api/v1/budgets', budgetsRouter(db));
  app.use('/api/v1/reports', reportsRouter(db));
  app.use('/api/v1/imports', importsRouter(db));
  app.use('/api/v1/settings', settingsRouter(db));
  app.use('/api/v1/accounts', accountsRouter(db));
  app.use('/api/v1/categories', categoriesRouter(db));
  app.use('/api/v1/transactions', transactionsRouter(db));

  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found.' } }));

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ApiError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } });
      return;
    }
    if (error && typeof error === 'object' && 'status' in error && error.status === 413 && 'type' in error && error.type === 'entity.too.large') {
      res.status(400).json({error:{code:'REQUEST_TOO_LARGE',message:'Request exceeds the JSON size limit. Use a smaller batch.'}});
      return;
    }
    if (isBodyParserSyntaxError(error)) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Request body must be valid JSON.' } });
      return;
    }
    console.error(`Unhandled error (${error instanceof Error ? error.name : typeof error})`);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
  });

  return app;
}
