import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { openDatabase } from '../src/db/connection';
import { createApp } from '../src/app';

describe('Foundation: persistent database and API contracts', () => {
  test('opens with foreign keys enabled and household settings without financial sample data', () => {
    const db = openDatabase(':memory:');
    try {
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(db.prepare('SELECT household_timezone, currency FROM settings').get()).toEqual({ household_timezone: 'America/Los_Angeles', currency: 'USD' });
      expect(db.prepare('SELECT count(*) AS count FROM schema_migrations').get()).toEqual({ count: 5 });
    } finally { db.close(); }
  });
  test('reopening a real file preserves settings and does not rerun migrations', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dailyledger-test-'));
    try {
      const db = openDatabase(join(directory, 'ledger.db'));
      try { db.prepare("UPDATE settings SET household_timezone = 'America/New_York'").run(); } finally { db.close(); }
      const reopened = openDatabase(join(directory, 'ledger.db'));
      try {
        expect(reopened.pragma('journal_mode', { simple: true })).toBe('wal');
        expect(reopened.prepare('SELECT household_timezone FROM settings').get()).toEqual({ household_timezone: 'America/New_York' });
        expect(reopened.prepare('SELECT count(*) AS count FROM schema_migrations').get()).toEqual({ count: 5 });
      } finally { reopened.close(); }
    } finally { if (!resolve(directory).startsWith(join(resolve(tmpdir()), 'dailyledger-test-'))) throw new Error('Unsafe test cleanup path'); rmSync(directory, { recursive: true, force: true }); }
  });
  test('initial timezone is configurable and a restart preserves the saved setting and revision', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dailyledger-test-'));
    try {
      const db = openDatabase(join(directory, 'ledger.db'), 'America/New_York');
      try { expect(db.prepare('SELECT household_timezone, revision FROM settings').get()).toEqual({ household_timezone: 'America/New_York', revision: 1 }); } finally { db.close(); }
      const reopened = openDatabase(join(directory, 'ledger.db'), 'America/Los_Angeles');
      try { expect(reopened.prepare('SELECT household_timezone, revision FROM settings').get()).toEqual({ household_timezone: 'America/New_York', revision: 1 }); } finally { reopened.close(); }
    } finally { if (!resolve(directory).startsWith(join(resolve(tmpdir()), 'dailyledger-test-'))) throw new Error('Unsafe test cleanup path'); rmSync(directory, { recursive: true, force: true }); }
  });
  test('readiness checks a real database and reveals no financial information', async () => {
    const db = openDatabase(':memory:');
    try {
      const response = await request(createApp(db)).get('/api/v1/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: { status: 'ready' } });
    } finally { db.close(); }
  });
  test('unknown API paths return a JSON error contract', async () => {
    const db = openDatabase(':memory:');
    try {
      const response = await request(createApp(db)).get('/api/v1/unknown');
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Resource not found.' } });
    } finally { db.close(); }
  });
  test('readiness returns an unavailable status when database cannot be read', async () => {
    const db = openDatabase(':memory:'); const app = createApp(db); db.close();
    const response = await request(app).get('/api/v1/health');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: { code: 'NOT_READY', message: 'Service is not ready.' } });
  });
});
