import { parsePageRequest, paginationMeta } from '../lib/pagination';
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Category, CategoryKind } from '../types/domain';
import { badRequest, conflict, notFound, unprocessable } from '../lib/errors';

const KINDS: readonly CategoryKind[] = ['income', 'expense'];

export interface CreateCategoryInput {
  name: string;
  kind: string;
}

function validateName(name: unknown): string {
  if (typeof name !== 'string' || name.trim().length === 0) throw badRequest('name is required.', { name: 'required' });
  return name.trim();
}

function assertUniqueActiveName(db: Database.Database, kind: string, name: string, excludeId?: string): void {
  const existing = db
    .prepare('SELECT id FROM categories WHERE kind = ? AND name = ? AND archived_at IS NULL AND id != ?')
    .get(kind, name, excludeId ?? '') as { id: string } | undefined;
  if (existing) throw unprocessable(`An active ${kind} category named "${name}" already exists.`, { name: 'duplicate' });
}

export function listCategories(db: Database.Database, includeArchived: boolean, query: Record<string, unknown> = {}) {
  const { page, pageSize } = parsePageRequest(query);
  const where = includeArchived ? '' : 'WHERE archived_at IS NULL';
  const total = (db.prepare(`SELECT count(*) AS count FROM categories ${where}`).get() as { count: number }).count;
  const items = db.prepare(`SELECT * FROM categories ${where} ORDER BY archived_at IS NOT NULL, kind, name, id LIMIT ? OFFSET ?`)
    .all(pageSize, (page - 1) * pageSize) as Category[];
  return { items, meta: paginationMeta(page, pageSize, total) };
}
export function getCategory(db: Database.Database, id: string): Category {
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as Category | undefined;
  if (!row) throw notFound('Category not found.');
  return row;
}

export function createCategory(db: Database.Database, input: CreateCategoryInput): Category {
  if (!KINDS.includes(input.kind as CategoryKind)) throw badRequest('kind must be income or expense.', { kind: 'invalid' });
  const name = validateName(input.name);
  assertUniqueActiveName(db, input.kind, name);
  const id = randomUUID();
  db.prepare('INSERT INTO categories (id, name, kind) VALUES (?, ?, ?)').run(id, name, input.kind);
  return getCategory(db, id);
}

export function renameCategory(db: Database.Database, id: string, name: string, expectedRevision: number): Category {
  const current = getCategory(db, id);
  if (current.revision !== expectedRevision) throw conflict('Category has been changed by someone else.');
  const trimmed = validateName(name);
  assertUniqueActiveName(db, current.kind, trimmed, id);
  db.prepare(
    `UPDATE categories SET name = ?, revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ? AND revision = ?`,
  ).run(trimmed, id, expectedRevision);
  return getCategory(db, id);
}

export function archiveCategory(db: Database.Database, id: string, expectedRevision: number): Category {
  const current = getCategory(db, id);
  if (current.revision !== expectedRevision) throw conflict('Category has been changed by someone else.');
  db.prepare(
    `UPDATE categories SET archived_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), revision = revision + 1,
     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND revision = ?`,
  ).run(id, expectedRevision);
  return getCategory(db, id);
}
