import { Router } from 'express';
import type Database from 'better-sqlite3';

interface SettingsRow { household_timezone: string; currency: string }

export function settingsRouter(db: Database.Database): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    const row = db.prepare('SELECT household_timezone, currency FROM settings WHERE id = 1').get() as SettingsRow;
    res.json({ data: row });
  });
  return router;
}
