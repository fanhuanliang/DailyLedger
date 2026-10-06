import { roundHalfUpCents } from '../lib/money';
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { badRequest, conflict, notFound, unprocessable } from '../lib/errors';
import { requireExpectedRevision } from '../lib/validation';
import { isValidCalendarDate } from '../lib/calendarDate';
import { getHouseholdToday } from '../lib/householdTime';
import { parsePageRequest, paginationMeta } from '../lib/pagination';
import { validateTransactionInput, createTransaction, getTransaction } from './transactionsService';
import { recurrenceDates, addCalendarDays, type Schedule } from './recurrenceDates';
import type { Transaction } from '../types/domain';
interface Template {
    id: string;
    name: string;
    status: 'active' | 'ended';
    ended_on: string | null;
    revision: number;
    created_at: string;
    updated_at: string;
}
interface Version {
    id: string;
    template_id: string;
    effective_date: string;
    generation_from: string;
    amount_cents: number;
    type: 'income' | 'expense';
    account_id: string;
    category_id: string;
    description: string;
    cadence: Schedule['cadence'];
    anchor_date: string;
    end_date: string | null;
    created_at: string;
    updated_at: string;
}
interface Occurrence {
    id: string;
    template_id: string;
    due_date: string;
    version_id: string;
    status: 'unconfirmed' | 'confirmed' | 'skipped';
    revision: number;
    created_at: string;
    updated_at: string;
}
const versionFields = ['effectiveDate', 'amountCents', 'type', 'accountId', 'categoryId', 'description', 'cadence', 'anchorDate', 'endDate'];
function bodyObject(value: unknown, fields: string[]): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw badRequest('A JSON object is required.');
    }
    const body = value as Record<string, unknown>;
    if (Object.keys(body).some(key => !fields.includes(key))) {
        throw badRequest('Unexpected recurring fields.');
    }
    return body;
}
function calendar(value: unknown, field: string): string {
    if (typeof value !== 'string' || !isValidCalendarDate(value)) {
        throw badRequest(field + ' must be a real YYYY-MM-DD calendar date.');
    }
    return value;
}
function templateRow(db: Database.Database, id: string): Template {
    const row = db.prepare('SELECT * FROM recurring_templates WHERE id=?').get(id) as Template | undefined;
    if (!row) {
        throw notFound('Recurring schedule not found.');
    }
    return row;
}
function versions(db: Database.Database, id: string): Version[] {
    return db.prepare('SELECT * FROM recurring_versions WHERE template_id=? ORDER BY effective_date').all(id) as Version[];
}
function versionData(row: Version) {
    return { id: row.id, templateId: row.template_id, effectiveDate: row.effective_date, amountCents: row.amount_cents, type: row.type, accountId: row.account_id, categoryId: row.category_id, description: row.description, cadence: row.cadence, anchorDate: row.anchor_date, endDate: row.end_date, createdAt: row.created_at, updatedAt: row.updated_at };
}
function templateData(db: Database.Database, row: Template) {
    return { id: row.id, name: row.name, status: row.status, endedOn: row.ended_on, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at, versions: versions(db, row.id).map(versionData) };
}
function validateVersion(db: Database.Database, body: Record<string, unknown>, base?: Version) {
    const effectiveDate = calendar(body.effectiveDate, 'effectiveDate');
    const anchorDate = calendar((body.anchorDate === undefined ? base?.anchor_date : body.anchorDate), 'anchorDate');
    const endDate = body.endDate === undefined ? base?.end_date ?? null : body.endDate;
    if (endDate !== null) {
        calendar(endDate, 'endDate');
        if (String(endDate) < effectiveDate || String(endDate) < anchorDate) {
            throw badRequest('endDate must not precede effectiveDate or anchorDate.');
        }
    }
    const cadence = (body.cadence === undefined ? base?.cadence : body.cadence);
    if (typeof cadence !== 'string' || !['weekly', 'biweekly', 'monthly', 'yearly'].includes(cadence)) {
        throw badRequest('Choose weekly, biweekly, monthly or yearly cadence.');
    }
    const amountCents = (body.amountCents === undefined ? base?.amount_cents : body.amountCents);
    const type = (body.type === undefined ? base?.type : body.type), accountId = (body.accountId === undefined ? base?.account_id : body.accountId), categoryId = (body.categoryId === undefined ? base?.category_id : body.categoryId), description = (body.description === undefined ? base?.description : body.description);
    if (type !== 'income' && type !== 'expense') {
        throw badRequest('Recurring type must be income or expense.');
    }
    validateTransactionInput(db, { date: anchorDate < effectiveDate ? effectiveDate : anchorDate, amountCents, type, accountId, categoryId, description });
    return { effectiveDate, anchorDate, endDate: endDate as string | null, cadence: cadence as Schedule['cadence'], amountCents: amountCents as number, type, accountId: accountId as string, categoryId: categoryId as string, description: (description as string).trim() };
}
function insertVersion(db: Database.Database, templateId: string, input: ReturnType<typeof validateVersion>, generationFrom = input.effectiveDate) {
    const id = randomUUID();
    db.prepare('INSERT INTO recurring_versions(id,template_id,effective_date,generation_from,amount_cents,type,account_id,category_id,description,cadence,anchor_date,end_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id, templateId, input.effectiveDate, generationFrom, input.amountCents, input.type, input.accountId, input.categoryId, input.description, input.cadence, input.anchorDate, input.endDate);
    return id;
}
function materialize(db: Database.Database, template: Template, from: string, to: string) {
    const rows = versions(db, template.id);
    const upper = template.ended_on && template.ended_on < to ? template.ended_on : to;
    const insert = db.prepare('INSERT INTO occurrences(id,template_id,due_date,version_id) VALUES(?,?,?,?) ON CONFLICT(template_id,due_date) DO NOTHING');
    for (let index = 0; index < rows.length; index++) {
        const row = rows[index]!, next = rows[index + 1];
        const segmentEnd = next && next.effective_date <= upper ? addCalendarDays(next.effective_date, -1) : upper;
        let dates: string[];
        try {
            dates = recurrenceDates({ cadence: row.cadence, anchorDate: row.anchor_date, effectiveDate: row.effective_date, endDate: row.end_date }, from > row.generation_from ? from : row.generation_from, segmentEnd);
        }
        catch {
            throw unprocessable('Schedule exceeds the supported 10000 occurrences per range. Narrow the date range.');
        }
        for (const date of dates)
            insert.run(randomUUID(), template.id, date, row.id);
    }
}
export function createRecurring(db: Database.Database, value: unknown) {
    const body = bodyObject(value, ['name', ...versionFields]);
    if (typeof body.name !== 'string' || !body.name.trim()) {
        throw badRequest('Schedule name is required.');
    }
    return db.transaction(() => {
        const input = validateVersion(db, body), id = randomUUID();
        db.prepare('INSERT INTO recurring_templates(id,name) VALUES(?,?)').run(id, (body.name as string).trim());
        insertVersion(db, id, input);
        const row = templateRow(db, id);
        materialize(db, row, input.effectiveDate, addCalendarDays(getHouseholdToday(db), 30));
        return templateData(db, row);
    })();
}
export function listRecurring(db: Database.Database, query: Record<string, unknown>) {
    const { page, pageSize } = parsePageRequest(query);
    return db.transaction(() => {
        const total = (db.prepare('SELECT count(*) AS n FROM recurring_templates').get() as {
            n: number;
        }).n;
        const rows = db.prepare('SELECT * FROM recurring_templates ORDER BY name,id LIMIT ? OFFSET ?').all(pageSize, (page - 1) * pageSize) as Template[];
        return { items: rows.map(row => templateData(db, row)), meta: paginationMeta(page, pageSize, total) };
    })();
}
export function updateRecurring(db: Database.Database, id: string, value: unknown) {
    const body = bodyObject(value, ['name', 'status', 'expectedRevision']), expected = requireExpectedRevision(body);
    return db.transaction(() => {
        const current = templateRow(db, id);
        if (current.revision !== expected) {
            throw conflict('Schedule changed since it was loaded.');
        }
        const name = (body.name === undefined ? current.name : body.name);
        if (typeof name !== 'string' || !name.trim()) {
            throw badRequest('Schedule name is required.');
        }
        const status = (body.status === undefined ? current.status : body.status);
        if (status !== 'active' && status !== 'ended') {
            throw badRequest('Schedule status must be active or ended.');
        }
        if (current.status === 'ended' && status === 'active') {
            throw unprocessable('Ended schedules retain history. Create a new schedule to restart.');
        }
        const endedOn = status === 'ended' ? current.ended_on ?? getHouseholdToday(db) : null;
        db.prepare("UPDATE recurring_templates SET name=?,status=?,ended_on=?,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(name.trim(), status, endedOn, id);
        if (endedOn) {
            db.prepare("DELETE FROM occurrences WHERE template_id=? AND due_date>? AND status='unconfirmed'").run(id, endedOn);
        }
        return templateData(db, templateRow(db, id));
    })();
}
function prepareVersion(db: Database.Database, id: string, value: unknown) {
    const body = bodyObject(value, ['expectedRevision', 'percentageChange', ...versionFields]);
    const expected = requireExpectedRevision(body), current = templateRow(db, id);
    if (current.revision !== expected) {
        throw conflict('Schedule changed since it was loaded.');
    }
    if (current.status === 'ended') {
        throw unprocessable('An ended schedule cannot receive new versions.');
    }
    const effectiveDate = calendar(body.effectiveDate, 'effectiveDate'), rows = versions(db, id), base = rows.filter(row => row.effective_date <= effectiveDate).at(-1);
    if (!base) {
        throw unprocessable('A change cannot precede the first schedule version.');
    }
    if (rows.some(row => row.effective_date === effectiveDate)) {
        throw conflict('A version already exists for that effective date.');
    }
    if (body.percentageChange !== undefined) {
        if (body.amountCents !== undefined) {
            throw badRequest('Choose a fixed amount or percentage change, not both.');
        }
        if (typeof body.percentageChange !== 'string' || body.percentageChange.length > 128 || !/^[-+]?\d+(?:\.\d+)?$/.test(body.percentageChange)) {
            throw badRequest('percentageChange must be an exact decimal string.');
        }
        try {
            body.amountCents = roundHalfUpCents(base.amount_cents, body.percentageChange);
        }
        catch {
            throw badRequest('Percentage change produces an unsupported amount.');
        }
    }
    return { current, input: validateVersion(db, body, base) };
}
export function previewRecurringVersion(db: Database.Database, id: string, value: unknown) {
    return db.transaction(() => prepareVersion(db, id, value).input)();
}
export function addRecurringVersion(db: Database.Database, id: string, value: unknown) {
    return db.transaction(() => {
        const { input } = prepareVersion(db, id, value);
        const createdToday = getHouseholdToday(db);
        insertVersion(db, id, input, input.effectiveDate > createdToday ? input.effectiveDate : createdToday);
        db.prepare("UPDATE recurring_templates SET revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(id);
        const today = getHouseholdToday(db), regenerateFrom = input.effectiveDate > today ? input.effectiveDate : today;
        db.prepare("DELETE FROM occurrences WHERE template_id=? AND status='unconfirmed' AND due_date>=?").run(id, regenerateFrom);
        materialize(db, templateRow(db, id), regenerateFrom, addCalendarDays(today, 30));
        return templateData(db, templateRow(db, id));
    })();
}
function occurrenceRow(db: Database.Database, id: string): Occurrence {
    const row = db.prepare('SELECT * FROM occurrences WHERE id=?').get(id) as Occurrence | undefined;
    if (!row) {
        throw notFound('Reminder not found.');
    }
    return row;
}
function occurrenceData(db: Database.Database, row: Occurrence) {
    const version = db.prepare('SELECT * FROM recurring_versions WHERE id=?').get(row.version_id) as Version;
    const template = templateRow(db, row.template_id);
    const transaction = db.prepare('SELECT * FROM transactions WHERE occurrence_id=?').get(row.id) as Transaction | undefined;
    return { id: row.id, templateId: row.template_id, name: template.name, dueDate: row.due_date, versionId: row.version_id, status: row.status, revision: row.revision, amountCents: version.amount_cents, type: version.type, accountId: version.account_id, categoryId: version.category_id, description: version.description, transaction: transaction ?? null };
}
export function listReminders(db: Database.Database, query: Record<string, unknown>) {
    const { page, pageSize } = parsePageRequest(query);
    const today = getHouseholdToday(db), dateFrom = query.dateFrom === undefined ? undefined : calendar(query.dateFrom, 'dateFrom'), dateTo = query.dateTo === undefined ? addCalendarDays(today, 30) : calendar(query.dateTo, 'dateTo');
    if (dateFrom && dateFrom > dateTo) {
        throw badRequest('dateFrom must not follow dateTo.');
    }
    const status = query.status ?? (dateFrom || query.dateTo ? 'all' : 'unconfirmed');
    if (!['all', 'unconfirmed', 'confirmed', 'skipped'].includes(String(status))) {
        throw badRequest('Invalid reminder status.');
    }
    return db.transaction(() => {
        const templates = db.prepare('SELECT * FROM recurring_templates').all() as Template[];
        for (const template of templates) {
            const first = versions(db, template.id)[0];
            if (first) {
                materialize(db, template, dateFrom ?? first.effective_date, dateTo);
            }
        }
        const conditions = ['due_date<=?'], params: unknown[] = [dateTo];
        if (dateFrom) {
            conditions.push('due_date>=?');
            params.push(dateFrom);
        }
        if (status !== 'all') {
            conditions.push('status=?');
            params.push(status);
        }
        const where = conditions.join(' AND '), total = (db.prepare('SELECT count(*) AS n FROM occurrences WHERE ' + where).get(...params) as {
            n: number;
        }).n;
        const rows = db.prepare('SELECT * FROM occurrences WHERE ' + where + ' ORDER BY due_date,id LIMIT ? OFFSET ?').all(...params, pageSize, (page - 1) * pageSize) as Occurrence[];
        return { items: rows.map(row => occurrenceData(db, row)), meta: paginationMeta(page, pageSize, total) };
    })();
}
export function confirmReminder(db: Database.Database, id: string, value: unknown) {
    const body = bodyObject(value, ['expectedRevision', 'date', 'amountCents', 'description', 'accountId', 'categoryId', 'notes']), expected = requireExpectedRevision(body);
    return db.transaction(() => {
        const occurrence = occurrenceRow(db, id);
        if (occurrence.revision !== expected) {
            throw conflict('Reminder changed since it was loaded.');
        }
        if (occurrence.status !== 'unconfirmed') {
            throw conflict('Only an unconfirmed reminder can create a record.');
        }
        const version = db.prepare('SELECT * FROM recurring_versions WHERE id=?').get(occurrence.version_id) as Version;
        const created = createTransaction(db, { date: (body.date === undefined ? occurrence.due_date : body.date), amountCents: (body.amountCents === undefined ? version.amount_cents : body.amountCents), description: (body.description === undefined ? version.description : body.description), type: version.type, accountId: (body.accountId === undefined ? version.account_id : body.accountId), categoryId: (body.categoryId === undefined ? version.category_id : body.categoryId), notes: body.notes });
        db.prepare("UPDATE transactions SET source='recurring',occurrence_id=? WHERE id=?").run(id, created.id);
        db.prepare("UPDATE occurrences SET status='confirmed',revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(id);
        return { ...occurrenceData(db, occurrenceRow(db, id)), transaction: getTransaction(db, created.id) };
    })();
}
export function skipReminder(db: Database.Database, id: string, value: unknown) {
    const body = bodyObject(value, ['expectedRevision']), expected = requireExpectedRevision(body);
    return db.transaction(() => {
        const current = occurrenceRow(db, id);
        if (current.revision !== expected) {
            throw conflict('Reminder changed since it was loaded.');
        }
        if (current.status !== 'unconfirmed') {
            throw conflict('Only an unconfirmed reminder can be skipped.');
        }
        db.prepare("UPDATE occurrences SET status='skipped',revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(id);
        return occurrenceData(db, occurrenceRow(db, id));
    })();
}
