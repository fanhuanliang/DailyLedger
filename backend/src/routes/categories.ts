import { parseIncludeArchived } from '../lib/pagination';
import { Router } from 'express';
import type Database from 'better-sqlite3';
import * as categoriesService from '../services/categoriesService';
import { requireExpectedRevision } from '../lib/validation';
import { badRequest } from '../lib/errors';

export function categoriesRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const includeArchived = parseIncludeArchived(req.query.includeArchived);
    const result = categoriesService.listCategories(db, includeArchived, req.query);
    res.json({ data: result.items, meta: result.meta });
  });

  router.post('/', (req, res) => {
    const body = req.body ?? {};
    const category = categoriesService.createCategory(db, { name: body.name, kind: body.kind });
    res.status(201).json({ data: category });
  });

  router.get('/:id', (req, res) => {
    res.json({ data: categoriesService.getCategory(db, req.params.id) });
  });

  router.patch('/:id', (req, res) => {
    const body = req.body ?? {};
    const expectedRevision = requireExpectedRevision(body);
    if (typeof body.name !== 'string') throw badRequest('name is required.', { name: 'required' });
    res.json({ data: categoriesService.renameCategory(db, req.params.id, body.name, expectedRevision) });
  });

  router.post('/:id/archive', (req, res) => {
    const expectedRevision = requireExpectedRevision(req.body ?? {});
    res.json({ data: categoriesService.archiveCategory(db, req.params.id, expectedRevision) });
  });

  return router;
}
