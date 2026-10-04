import { Router } from 'express';
import type Database from 'better-sqlite3';
import * as transactionsService from '../services/transactionsService';
import { requireExpectedRevision } from '../lib/validation';

export function transactionsRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const query = req.query as Record<string, unknown>;
    const result = transactionsService.listTransactions(db, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      text: query.text,
      categoryId: query.categoryId,
      accountId: query.accountId,
      type: query.type,
      page: query.page,
      pageSize: query.pageSize,
    });
    res.json({ data: result.items, meta: result.meta });
  });

  router.post('/', (req, res) => {
    const transaction = transactionsService.createTransaction(db, req.body ?? {});
    res.status(201).json({ data: transaction });
  });

  router.get('/:id', (req, res) => {
    res.json({ data: transactionsService.getTransaction(db, req.params.id) });
  });

  router.patch('/:id', (req, res) => {
    const body = req.body ?? {};
    const expectedRevision = requireExpectedRevision(body);
    const transaction = transactionsService.updateTransaction(db, req.params.id, body, expectedRevision);
    res.json({ data: transaction });
  });

  router.delete('/:id', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const expectedRevision = requireExpectedRevision(
      Object.keys(body).length > 0 ? body : { expectedRevision: Number(req.query.expectedRevision) },
    );
    transactionsService.deleteTransaction(db, req.params.id, expectedRevision);
    res.status(204).send();
  });

  return router;
}
