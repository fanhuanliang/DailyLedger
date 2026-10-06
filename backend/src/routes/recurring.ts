import { Router } from 'express';
import type Database from 'better-sqlite3';
import * as service from '../services/recurringService';
export function recurringRouter(db: Database.Database): Router {
    const router = Router();
    router.get('/', (req, res) => {
        const result = service.listRecurring(db, req.query);
        res.json({ data: result.items, meta: result.meta });
    });
    router.post('/', (req, res) => res.status(201).json({ data: service.createRecurring(db, req.body) }));
    router.patch('/:id', (req, res) => res.json({ data: service.updateRecurring(db, req.params.id, req.body) }));
    router.post('/:id/versions', (req, res) => res.status(201).json({ data: service.addRecurringVersion(db, req.params.id, req.body) }));
    router.post('/:id/version-preview', (req, res) => res.json({ data: service.previewRecurringVersion(db, req.params.id, req.body) }));
    return router;
}
export function remindersRouter(db: Database.Database): Router {
    const router = Router();
    router.get('/', (req, res) => {
        const result = service.listReminders(db, req.query);
        res.json({ data: result.items, meta: result.meta });
    });
    router.post('/:id/confirm', (req, res) => res.json({ data: service.confirmReminder(db, req.params.id, req.body) }));
    router.post('/:id/skip', (req, res) => res.json({ data: service.skipReminder(db, req.params.id, req.body) }));
    return router;
}
