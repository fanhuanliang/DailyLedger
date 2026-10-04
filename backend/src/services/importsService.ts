import type Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { ApiError, badRequest, conflict, notFound, unprocessable } from '../lib/errors';
import { createTransaction, validateTransactionInput, type TransactionInput } from './transactionsService';

interface ImportRow { clientRowId: string; decision: 'include' | 'skip'; record: TransactionInput; uncertaintyNotes: string[] }
type Duplicate = ({ transactionId: string } | { clientRowId: string }) & { match: 'exact' | 'nearby' };
interface ReviewedRow extends ImportRow { errors: { code: string; message: string; fields?: Record<string,string> }[]; duplicateCandidates: Duplicate[] }
interface PreviewRow { id: string; expires_at: string; payload_hash: string; rows_json: string; review_json: string; ledger_revision: string }
interface CommitResult { batchId: string; insertedIds: string[]; insertedCount: number; skippedCount: number }
interface BatchRow { request_hash: string; result_json: string }
const RECORD_KEYS = ['date','description','type','amountCents','accountId','destinationAccountId','categoryId','notes'];

function object(value: unknown, allowed: string[], label: string): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw badRequest(`${label} must be an object.`);
  const result = value as Record<string,unknown>;
  if (Object.keys(result).some((key) => !allowed.includes(key))) throw badRequest(`${label} contains unsupported fields. Supply normalized ledger data only.`);
  return result;
}
function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw badRequest(`${label} must be nonempty text of at most 200 characters.`);
  return value;
}
function normalizeRows(value: unknown): ImportRow[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 200) throw badRequest('rows must contain between 1 and 200 proposed records.');
  const ids = new Set<string>();
  return value.map((value) => {
    const row = object(value, ['clientRowId','decision','record','uncertaintyNotes'], 'row');
    const clientRowId = requiredText(row.clientRowId,'clientRowId');
    if (ids.has(clientRowId)) throw badRequest('clientRowId must be unique within a preview.');
    ids.add(clientRowId);
    if (row.decision !== 'include' && row.decision !== 'skip') throw badRequest('Each row requires an explicit include or skip decision.');
    const input = object(row.record, RECORD_KEYS, 'record');
    const record: Record<string,unknown> = {};
    for (const key of RECORD_KEYS) {
      const field = input[key];
      if (field === undefined) continue;
      if (key === 'amountCents') { if (typeof field !== 'number' || !Number.isFinite(field)) throw badRequest('amountCents must be a finite number.'); }
      else if (field !== null && typeof field !== 'string') throw badRequest(`${key} must be normalized text or null.`);
      record[key] = typeof field === 'string' ? field.trim() : field;
    }
    const notes = row.uncertaintyNotes ?? [];
    if (!Array.isArray(notes) || notes.length > 20 || notes.some((note) => typeof note !== 'string' || note.length > 500)) throw badRequest('uncertaintyNotes must contain at most 20 short text notes.');
    return {clientRowId,decision:row.decision,record,uncertaintyNotes:notes as string[]};
  });
}
function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
// Conservative snapshot: any financial or reference edit requires a fresh preview.
function ledgerRevision(db: Database.Database): string {
  return hash(['accounts','categories','transactions'].map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()));
}
function descriptionWords(value: string): Set<string> {
  return new Set(value.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+/gu) ?? []);
}
function normalizedDescription(value: string): string { return [...descriptionWords(value)].join(' '); }
function similar(a: string, b: string): boolean {
  const left = descriptionWords(a); const right = descriptionWords(b);
  const intersection = [...left].filter((word) => right.has(word)).length;
  return intersection > 0 && intersection / Math.max(left.size,right.size) >= 0.5;
}
function duplicateCandidates(db: Database.Database, record: TransactionInput): Duplicate[] {
  if (typeof record.date !== 'string' || typeof record.description !== 'string') return [];
  const candidates = db.prepare(`SELECT id,date,description FROM transactions WHERE account_id = ? AND type = ? AND amount_cents = ? AND abs(julianday(date) - julianday(?)) <= 3 ORDER BY date,id`)
    .all(record.accountId,record.type,record.amountCents,record.date) as {id:string;date:string;description:string}[];
  return candidates.flatMap((candidate): Duplicate[] => {
    if (candidate.date === record.date && normalizedDescription(candidate.description) === normalizedDescription(record.description as string)) return [{transactionId:candidate.id,match:'exact'}];
    return similar(candidate.description,record.description as string) ? [{transactionId:candidate.id,match:'nearby'}] : [];
  });
}
function reviewRows(db: Database.Database, rows: ImportRow[]): ReviewedRow[] {
  const reviewed = rows.map((row) => {
    let errors: ReviewedRow['errors'] = [];
    try { validateTransactionInput(db,row.record); }
    catch (error) {
      if (!(error instanceof ApiError)) throw error;
      errors = [{code:error.code,message:error.message,...(error.fields ? {fields:error.fields} : {})}];
    }
    return {...row,errors,duplicateCandidates:errors.length ? [] : duplicateCandidates(db,row.record)};
  });
  for (let index = 0; index < reviewed.length; index++) {
    const row = reviewed[index]!;
    if (row.errors.length) continue;
    for (const prior of reviewed.slice(0,index)) {
      if (prior.errors.length || prior.record.accountId !== row.record.accountId || prior.record.type !== row.record.type || prior.record.amountCents !== row.record.amountCents) continue;
      const days = Math.abs(Date.parse(prior.record.date as string)-Date.parse(row.record.date as string))/86_400_000;
      const left = prior.record.description as string; const right = row.record.description as string;
      if (days === 0 && normalizedDescription(left) === normalizedDescription(right)) row.duplicateCandidates.push({clientRowId:prior.clientRowId,match:'exact'});
      else if (days <= 3 && similar(left,right)) row.duplicateCandidates.push({clientRowId:prior.clientRowId,match:'nearby'});
    }
  }
  return reviewed;
}
function totals(rows: ReviewedRow[]) {
  let income = 0n; let expenses = 0n;
  for (const row of rows) {
    if (row.decision !== 'include' || row.errors.length) continue;
    const amount = BigInt(row.record.amountCents as number);
    if (row.record.type === 'income') income += amount;
    if (row.record.type === 'expense') expenses += amount;
    if (row.record.type === 'refund') expenses -= amount;
  }
  function safe(value: bigint) {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < -BigInt(Number.MAX_SAFE_INTEGER)) throw unprocessable('Selected totals exceed the supported integer-cent range.');
    return Number(value);
  }
  return {incomeCents:safe(income),netExpensesCents:safe(expenses),moneyLeftOverCents:safe(income-expenses)};
}
export function previewImport(db: Database.Database, value: unknown) {
  const body = object(value,['rows'],'preview');
  const rows = normalizeRows(body.rows);
  return db.transaction(() => {
    db.prepare('DELETE FROM import_previews WHERE expires_at <= ? AND NOT EXISTS (SELECT 1 FROM import_batches WHERE preview_id = import_previews.id)').run(new Date().toISOString());
    const reviewed = reviewRows(db,rows);
    const result = {id:randomUUID(),payloadHash:hash(rows),expiresAt:new Date(Date.now()+24*60*60*1000).toISOString(),rows:reviewed,totals:totals(reviewed),selectedCount:rows.filter((row)=>row.decision==='include').length,skippedCount:rows.filter((row)=>row.decision==='skip').length};
    db.prepare('INSERT INTO import_previews(id,expires_at,payload_hash,rows_json,review_json,ledger_revision) VALUES(?,?,?,?,?,?)').run(result.id,result.expiresAt,result.payloadHash,JSON.stringify(rows),JSON.stringify(reviewed),ledgerRevision(db));
    return result;
  })();
}
export function commitImport(db: Database.Database, previewId: string, value: unknown): CommitResult {
  const body = object(value,['approvalAcknowledged','payloadHash','idempotencyKey'],'commit');
  if (body.approvalAcknowledged !== true) throw badRequest('Approval of the exact preview must be acknowledged before committing.');
  const payloadHash = requiredText(body.payloadHash,'payloadHash');
  const key = requiredText(body.idempotencyKey,'idempotencyKey');
  const requestHash = hash({previewId,payloadHash});
  return db.transaction(() => {
    const previous = db.prepare('SELECT request_hash,result_json FROM import_batches WHERE idempotency_key = ?').get(key) as BatchRow | undefined;
    if (previous) {
      if (previous.request_hash !== requestHash) throw conflict('Idempotency key was already used for different content.','IDEMPOTENCY_CONFLICT');
      return JSON.parse(previous.result_json) as CommitResult;
    }
    const preview = db.prepare('SELECT * FROM import_previews WHERE id = ?').get(previewId) as PreviewRow | undefined;
    if (!preview) throw notFound('Import preview not found.');
    if (db.prepare('SELECT id FROM import_batches WHERE preview_id = ?').get(previewId)) throw conflict('This preview is already committed. Retry with the original key.','ALREADY_COMMITTED');
    if (preview.expires_at <= new Date().toISOString()) throw conflict('Import preview expired. Request a fresh preview.','PREVIEW_EXPIRED');
    if (preview.payload_hash !== payloadHash) throw conflict('Reviewed payload hash does not match.','PREVIEW_CHANGED');
    if (preview.ledger_revision !== ledgerRevision(db)) throw conflict('Ledger changed since review. Request a fresh preview.','STALE_PREVIEW');
    const rows = JSON.parse(preview.rows_json) as ImportRow[];
    const reviewed = reviewRows(db,rows);
    if (reviewed.some((row)=>row.decision==='include' && row.errors.length)) throw unprocessable('Selected rows contain validation errors; correct them in a new preview.');
    if (hash(reviewed) !== hash(JSON.parse(preview.review_json))) throw conflict('Duplicate candidates or validation changed. Request a fresh preview.','STALE_PREVIEW');
    const batchId = randomUUID(); const insertedIds: string[] = [];
    for (const row of rows) {
      if (row.decision !== 'include') continue;
      const transaction = createTransaction(db,row.record);
      db.prepare("UPDATE transactions SET source = 'mcp', import_batch_id = ? WHERE id = ?").run(batchId,transaction.id);
      insertedIds.push(transaction.id);
    }
    const result = {batchId,insertedIds,insertedCount:insertedIds.length,skippedCount:rows.filter((row)=>row.decision==='skip').length};
    db.prepare('INSERT INTO import_batches(id,idempotency_key,preview_id,payload_hash,request_hash,committed_at,result_json) VALUES(?,?,?,?,?,?,?)').run(batchId,key,previewId,payloadHash,requestHash,new Date().toISOString(),JSON.stringify(result));
    return result;
  })();
}
