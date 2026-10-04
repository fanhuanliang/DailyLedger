import { parseIncludeArchived } from '../lib/pagination';
import { Router } from 'express';
import type Database from 'better-sqlite3';
import * as accountsService from '../services/accountsService';
import { requireExpectedRevision } from '../lib/validation';

export function accountsRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const includeArchived = parseIncludeArchived(req.query.includeArchived);
    const result = accountsService.listAccounts(db, includeArchived, req.query);
    res.json({ data: result.items, meta: result.meta });
  });

  router.post('/', (req, res) => {
    const body = req.body ?? {};
    const account = accountsService.createAccount(db, {
      name: body.name,
      type: body.type,
      openingDate: body.openingDate,
      openingBalanceCents: body.openingBalanceCents,
    });
    res.status(201).json({ data: account });
  });

  router.get('/:id', (req, res) => {
    res.json({ data: accountsService.getAccount(db, req.params.id) });
  });

  router.patch('/:id', (req, res) => {
    const body = req.body ?? {};
    const expectedRevision = requireExpectedRevision(body);
    const account = accountsService.updateAccount(
      db,
      req.params.id,
      { name: body.name, openingDate: body.openingDate, openingBalanceCents: body.openingBalanceCents },
      expectedRevision,
    );
    res.json({ data: account });
  });

  router.post('/:id/archive', (req, res) => {
    const expectedRevision = requireExpectedRevision(req.body ?? {});
    res.json({ data: accountsService.archiveAccount(db, req.params.id, expectedRevision) });
  });

  return router;
}
