import { buildAuthorizedTestApp } from './helpers/testApp';
describe('AC9/AC10 recurring versions and reminders', () => {
    async function setup() { const app = buildAuthorizedTestApp(); const account = (await app.agent.post('/api/v1/accounts').send({ name: 'Checking', type: 'checking', openingDate: '2020-01-01', openingBalanceCents: 0 })).body.data; const category = (await app.agent.post('/api/v1/categories').send({ name: 'Salary', kind: 'income' })).body.data; return { ...app, input: { name: 'Salary', effectiveDate: '2026-01-01', amountCents: 500000, type: 'income', accountId: account.id, categoryId: category.id, description: 'Monthly salary', cadence: 'monthly', anchorDate: '2026-01-31', endDate: null } }; }
    test('malformed cadence arrays are rejected without creating or changing schedules', async () => {
        const { db, agent, input } = await setup();
        try {
            expect((await agent.post('/api/v1/recurring').send({ ...input, cadence: ['monthly'] })).status).toBe(400);
            expect(db.prepare('SELECT count(*) AS n FROM recurring_templates').get()).toEqual({ n: 0 });
            const template = (await agent.post('/api/v1/recurring').send(input)).body.data;
            const change = { expectedRevision: 1, effectiveDate: '2027-01-01', cadence: ['monthly'] };
            expect((await agent.post(`/api/v1/recurring/${template.id}/version-preview`).send(change)).status).toBe(400);
            expect((await agent.post(`/api/v1/recurring/${template.id}/versions`).send(change)).status).toBe(400);
            expect(db.prepare('SELECT count(*) AS n FROM recurring_versions').get()).toEqual({ n: 1 });
            expect(db.prepare('SELECT revision FROM recurring_templates WHERE id = ?').get(template.id)).toEqual({ revision: 1 });
        } finally { db.close(); }
    });
    test('reminder status rejects repeated query values', async () => {
        const { db, agent } = await setup();
        try {
            expect((await agent.get('/api/v1/reminders?status=unconfirmed&status=unconfirmed')).status).toBe(400);
        } finally { db.close(); }
    });
    test('AC9 creates reminders only and clamps monthly dates without anchor drift', async () => {
        const { db, agent, input } = await setup();
        try {
            const created = await agent.post('/api/v1/recurring').send(input);
            expect(created.status).toBe(201);
            const reminders = await agent.get('/api/v1/reminders?dateFrom=2026-01-01&dateTo=2026-03-31');
            expect(reminders.status).toBe(200);
            expect(reminders.body.data.map((row: {
                dueDate: string;
            }) => row.dueDate)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
            expect(db.prepare('SELECT count(*) AS n FROM transactions').get()).toEqual({ n: 0 });
        }
        finally {
            db.close();
        }
    });
    test('AC9 confirmation links exactly one editable transaction and deletion reopens occurrence', async () => {
        const { db, agent, input } = await setup();
        try {
            await agent.post('/api/v1/recurring').send(input);
            const occurrence = (await agent.get('/api/v1/reminders?dateFrom=2026-01-01&dateTo=2026-01-31')).body.data?.[0];
            const confirmed = await agent.post(`/api/v1/reminders/${occurrence?.id}/confirm`).send({ expectedRevision: 1, amountCents: 510000, description: 'One time adjustment' });
            expect(confirmed.status).toBe(200);
            const transaction = confirmed.body.data.transaction;
            expect(transaction).toMatchObject({ amount_cents: 510000, source: 'recurring', occurrence_id: occurrence.id });
            expect((await agent.post(`/api/v1/reminders/${occurrence.id}/confirm`).send({ expectedRevision: 1 })).status).toBe(409);
            expect(db.prepare('SELECT count(*) AS n FROM transactions').get()).toEqual({ n: 1 });
            expect((await agent.delete(`/api/v1/transactions/${transaction.id}`).send({ expectedRevision: transaction.revision })).status).toBe(204);
            const reopened = (await agent.get('/api/v1/reminders?dateFrom=2026-01-01&dateTo=2026-01-31')).body.data[0];
            expect(reopened).toMatchObject({ status: 'unconfirmed', revision: 3, transaction: null });
        }
        finally {
            db.close();
        }
    });
    test('AC10 a future percentage version preserves confirmed transaction and prior schedule history', async () => {
        const { db, agent, input } = await setup();
        try {
            const template = (await agent.post('/api/v1/recurring').send(input)).body.data;
            const occurrence = (await agent.get('/api/v1/reminders?dateFrom=2026-01-01&dateTo=2026-01-31')).body.data?.[0];
            const confirmed = await agent.post(`/api/v1/reminders/${occurrence?.id}/confirm`).send({ expectedRevision: 1 });
            expect(confirmed.status).toBe(200);
            const record = confirmed.body.data.transaction;
            const changed = await agent.post(`/api/v1/recurring/${template?.id}/versions`).send({ expectedRevision: 1, effectiveDate: '2027-01-01', percentageChange: '3' });
            expect(changed.status).toBe(201);
            const future = (await agent.get('/api/v1/reminders?dateFrom=2027-01-01&dateTo=2027-03-31')).body.data;
            expect(future.map((row: {
                amountCents: number;
            }) => row.amountCents)).toEqual([515000, 515000, 515000]);
            expect((await agent.get(`/api/v1/transactions/${record.id}`)).body.data).toEqual(record);
            const prior = (await agent.get('/api/v1/reminders?dateFrom=2026-01-01&dateTo=2026-01-31')).body.data[0];
            expect(prior).toMatchObject({ id: occurrence.id, status: 'confirmed' });
        }
        finally {
            db.close();
        }
    });
    test('skip is revision-protected and preserved by future schedule changes', async () => {
        const { db, agent, input } = await setup();
        try {
            const template = (await agent.post('/api/v1/recurring').send(input)).body.data;
            const future = (await agent.get('/api/v1/reminders?dateFrom=2027-01-01&dateTo=2027-01-31')).body.data?.[0];
            expect((await agent.post(`/api/v1/reminders/${future?.id}/skip`).send({ expectedRevision: 1 })).status).toBe(200);
            expect((await agent.post(`/api/v1/reminders/${future?.id}/skip`).send({ expectedRevision: 1 })).status).toBe(409);
            expect((await agent.post(`/api/v1/recurring/${template?.id}/versions`).send({ expectedRevision: 1, effectiveDate: '2027-01-01', amountCents: 600000, cadence: 'monthly', anchorDate: '2027-01-15' })).status).toBe(201);
            const reminders = (await agent.get('/api/v1/reminders?dateFrom=2027-01-01&dateTo=2027-01-31')).body.data;
            expect(reminders.some((row: {
                id: string;
                status: string;
            }) => row.id === future.id && row.status === 'skipped')).toBe(true);
            expect(reminders.some((row: {
                dueDate: string;
            }) => row.dueDate === '2027-01-15')).toBe(true);
            expect(db.prepare('SELECT count(*) AS n FROM transactions').get()).toEqual({ n: 0 });
        }
        finally {
            db.close();
        }
    });
    test('version preview shows exact resulting amount/effective date without writes', async () => {
        const { db, agent, input } = await setup();
        try {
            const template = (await agent.post('/api/v1/recurring').send(input)).body.data;
            const preview = await agent.post(`/api/v1/recurring/${template.id}/version-preview`).send({ expectedRevision: 1, effectiveDate: '2027-01-01', percentageChange: '3' });
            expect(preview.status).toBe(200);
            expect(preview.body.data).toMatchObject({ amountCents: 515000, effectiveDate: '2027-01-01' });
            expect(db.prepare('SELECT count(*) AS n FROM recurring_versions').get()).toEqual({ n: 1 });
            expect(db.prepare('SELECT count(*) AS n FROM transactions').get()).toEqual({ n: 0 });
        }
        finally {
            db.close();
        }
    });
    test.each(['amountCents', 'accountId', 'categoryId', 'type', 'description', 'anchorDate'])('explicit null %s is malformed rather than inherited', async (field) => {
        const { db, agent, input } = await setup();
        try {
            const template = (await agent.post('/api/v1/recurring').send(input)).body.data;
            const changed = await agent.post(`/api/v1/recurring/${template.id}/versions`).send({ expectedRevision: 1, effectiveDate: '2027-01-01', [field]: null });
            expect(changed.status).toBe(400);
            expect(db.prepare('SELECT count(*) AS n FROM recurring_versions').get()).toEqual({ n: 1 });
        }
        finally {
            db.close();
        }
    });
    test('confirmation rejects a supplied null amount instead of saving defaults', async () => {
        const { db, agent, input } = await setup();
        try {
            await agent.post('/api/v1/recurring').send(input);
            const occurrence = (await agent.get('/api/v1/reminders?dateFrom=2026-01-01&dateTo=2026-01-31')).body.data[0];
            expect((await agent.post(`/api/v1/reminders/${occurrence.id}/confirm`).send({ expectedRevision: 1, amountCents: null })).status).toBe(400);
            expect(db.prepare('SELECT count(*) AS n FROM transactions').get()).toEqual({ n: 0 });
        }
        finally {
            db.close();
        }
    });
    test('past-effective schedule change preserves overdue rows without generating retroactive extra dates', async () => {
        const { db, agent, input } = await setup();
        try {
            const template = (await agent.post('/api/v1/recurring').send(input)).body.data;
            const before = (await agent.get('/api/v1/reminders?dateFrom=2026-05-01&dateTo=2026-05-31')).body.data;
            expect((await agent.post(`/api/v1/recurring/${template.id}/versions`).send({ expectedRevision: 1, effectiveDate: '2026-05-01', anchorDate: '2026-05-15' })).status).toBe(201);
            const after = (await agent.get('/api/v1/reminders?dateFrom=2026-05-01&dateTo=2026-05-31')).body.data;
            expect(after).toEqual(before);
        }
        finally {
            db.close();
        }
    });
    test('a failure after transaction insert rolls back confirmation completely', async () => {
        const { db, agent, input } = await setup();
        try {
            await agent.post('/api/v1/recurring').send(input);
            const occurrence = (await agent.get('/api/v1/reminders?dateFrom=2026-01-01&dateTo=2026-01-31')).body.data[0];
            db.exec("CREATE TRIGGER fail_confirmation BEFORE UPDATE ON occurrences WHEN NEW.status='confirmed' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
            expect((await agent.post(`/api/v1/reminders/${occurrence.id}/confirm`).send({ expectedRevision: 1 })).status).toBe(500);
            expect(db.prepare('SELECT count(*) AS n FROM transactions').get()).toEqual({ n: 0 });
            expect(db.prepare('SELECT status,revision FROM occurrences WHERE id=?').get(occurrence.id)).toEqual({ status: 'unconfirmed', revision: 1 });
        }
        finally {
            db.close();
        }
    });
    test('ending preserves confirmed/skipped history and removes only unconfirmed future reminders', async () => {
        const { db, agent, input } = await setup();
        try {
            const template = (await agent.post('/api/v1/recurring').send(input)).body.data;
            const rows = (await agent.get('/api/v1/reminders?dateFrom=2027-01-01&dateTo=2027-03-31')).body.data;
            await agent.post(`/api/v1/reminders/${rows[0].id}/confirm`).send({ expectedRevision: 1 });
            await agent.post(`/api/v1/reminders/${rows[1].id}/skip`).send({ expectedRevision: 1 });
            expect((await agent.patch(`/api/v1/recurring/${template.id}`).send({ expectedRevision: 1, status: 'ended' })).status).toBe(200);
            const after = (await agent.get('/api/v1/reminders?dateFrom=2027-01-01&dateTo=2027-03-31')).body.data;
            expect(after.map((row: {
                status: string;
            }) => row.status)).toEqual(['confirmed', 'skipped']);
            expect(db.prepare('SELECT count(*) AS n FROM transactions').get()).toEqual({ n: 1 });
            expect((await agent.post(`/api/v1/recurring/${template.id}/versions`).send({ expectedRevision: 2, effectiveDate: '2028-01-01', amountCents: 1 })).status).toBe(422);
        }
        finally {
            db.close();
        }
    });
    test.each(['name', 'status'])('schedule edit rejects explicit null %s', async (field) => {
        const { db, agent, input } = await setup();
        try {
            const template = (await agent.post('/api/v1/recurring').send(input)).body.data;
            expect((await agent.patch(`/api/v1/recurring/${template.id}`).send({ expectedRevision: 1, [field]: null })).status).toBe(400);
        }
        finally {
            db.close();
        }
    });
});
