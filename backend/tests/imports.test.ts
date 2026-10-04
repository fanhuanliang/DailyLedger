import { buildAuthorizedTestApp } from './helpers/testApp';

describe('AC11-13 reviewed normalized imports', () => {
  async function setup() {
    const app = buildAuthorizedTestApp();
    const account = (await app.agent.post('/api/v1/accounts').send({ name: 'Checking', type: 'checking', openingDate: '2026-01-01', openingBalanceCents: 0 })).body.data;
    const category = (await app.agent.post('/api/v1/categories').send({ name: 'Groceries', kind: 'expense' })).body.data;
    const record = { date: '2026-01-05', description: 'Market purchase', type: 'expense', amountCents: 2000, accountId: account.id, categoryId: category.id };
    return { ...app, record };
  }
  test('AC11 preview creates zero transactions and returns review fields and selected totals', async () => {
    const {db,agent,record} = await setup();
    try {
      const res = await agent.post('/api/v1/imports/preview').send({ rows: [{clientRowId:'r1',decision:'include',record,uncertaintyNotes:['Confirm date']},{clientRowId:'r2',decision:'skip',record}] });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ payloadHash:expect.any(String), rows:expect.arrayContaining([expect.objectContaining({clientRowId:'r1',decision:'include',errors:[],uncertaintyNotes:['Confirm date']})]),totals:{incomeCents:0,netExpensesCents:2000,moneyLeftOverCents:-2000},selectedCount:1,skippedCount:1 });
      expect(db.prepare('SELECT count(*) AS n FROM transactions').get()).toEqual({n:0});
    } finally {db.close();}
  });
  test('AC11 flags exact and nearby duplicate candidates without skipping automatically', async () => {
    const {db,agent,record} = await setup();
    try {
      const existing=(await agent.post('/api/v1/transactions').send(record)).body.data;
      const res=await agent.post('/api/v1/imports/preview').send({rows:[{clientRowId:'exact',decision:'include',record},{clientRowId:'near',decision:'include',record:{...record,date:'2026-01-07',description:'Market purchase groceries'}}]});
      expect(res.status).toBe(201);
      expect(res.body.data.rows[0]).toMatchObject({decision:'include',duplicateCandidates:[{transactionId:existing.id,match:'exact'}]});
      expect(res.body.data.rows[1].duplicateCandidates).toEqual([{transactionId:existing.id,match:'nearby'},{clientRowId:'exact',match:'nearby'}]);
      expect(db.prepare('SELECT count(*) AS n FROM transactions').get()).toEqual({n:1});
    } finally {db.close();}
  });
  test('reports missing required fields in preview and forbids document payloads and repeated row IDs', async () => {
    const {db,agent,record}=await setup();
    try {
      const invalid=await agent.post('/api/v1/imports/preview').send({rows:[{clientRowId:'bad',decision:'include',record:{...record,categoryId:null}}]});
      expect(invalid.status).toBe(201);expect(invalid.body.data.rows[0].errors.length).toBeGreaterThan(0);
      for(const payload of [{documentText:'original statement',rows:[]},{rows:[{clientRowId:'1',decision:'include',record},{clientRowId:'1',decision:'skip',record}]}])expect((await agent.post('/api/v1/imports/preview').send(payload)).status).toBe(400);
    } finally {db.close();}
  });
  test('AC11 commits exactly included rows atomically with approval and hash', async () => {
    const {db,agent,record}=await setup();
    try {
      const p=(await agent.post('/api/v1/imports/preview').send({rows:[{clientRowId:'yes',decision:'include',record},{clientRowId:'no',decision:'skip',record}]})).body.data;
      const res=await agent.post(`/api/v1/imports/${p?.id}/commit`).send({approvalAcknowledged:true,payloadHash:p?.payloadHash,idempotencyKey:'key-1'});
      expect(res.status).toBe(200);expect(res.body.data).toMatchObject({insertedCount:1,skippedCount:1,insertedIds:[expect.any(String)]});
      expect(db.prepare('SELECT source,import_batch_id FROM transactions').get()).toEqual({source:'mcp',import_batch_id:res.body.data.batchId});
    } finally {db.close();}
  });
  test('AC12 unchanged retry returns original result and altered key reuse conflicts', async () => {
    const {db,agent,record}=await setup();
    try {
      const p=(await agent.post('/api/v1/imports/preview').send({rows:[{clientRowId:'r',decision:'include',record}]})).body.data;
      const body={approvalAcknowledged:true,payloadHash:p?.payloadHash,idempotencyKey:'retry'};
      const first=await agent.post(`/api/v1/imports/${p?.id}/commit`).send(body);expect(first.status).toBe(200);
      expect((await agent.post(`/api/v1/imports/${p?.id}/commit`).send(body)).body).toEqual(first.body);
      expect((await agent.post(`/api/v1/imports/${p?.id}/commit`).send({...body,payloadHash:'changed'})).status).toBe(409);
      expect(db.prepare('SELECT count(*) AS n FROM transactions').get()).toEqual({n:1});
    } finally {db.close();}
  });
  test('AC12 new duplicates after preview require refreshed review with zero batch inserts', async () => {
    const {db,agent,record}=await setup();
    try {
      const p=(await agent.post('/api/v1/imports/preview').send({rows:[{clientRowId:'r',decision:'include',record}]})).body.data;
      await agent.post('/api/v1/transactions').send(record);
      expect((await agent.post(`/api/v1/imports/${p?.id}/commit`).send({approvalAcknowledged:true,payloadHash:p?.payloadHash,idempotencyKey:'stale'})).status).toBe(409);
      expect(db.prepare('SELECT count(*) AS n FROM transactions').get()).toEqual({n:1});
    } finally {db.close();}
  });
  test('unapproved and invalid selected rows cannot commit', async () => {
    const {db,agent,record}=await setup();
    try {
      const p=(await agent.post('/api/v1/imports/preview').send({rows:[{clientRowId:'good',decision:'include',record},{clientRowId:'bad',decision:'include',record:{...record,amountCents:0}}]})).body.data;
      const body={payloadHash:p?.payloadHash,idempotencyKey:'invalid'};
      expect((await agent.post(`/api/v1/imports/${p?.id}/commit`).send({...body,approvalAcknowledged:false})).status).toBe(400);
      expect((await agent.post(`/api/v1/imports/${p?.id}/commit`).send({...body,approvalAcknowledged:true})).status).toBe(422);
      expect(db.prepare('SELECT count(*) AS n FROM transactions').get()).toEqual({n:0});
    } finally {db.close();}
  });

  test('AC11 duplicate hints also identify matching proposed rows without auto-skipping', async () => {
    const {db,agent,record}=await setup();
    try {
      const res=await agent.post('/api/v1/imports/preview').send({rows:[{clientRowId:'first',decision:'include',record},{clientRowId:'second',decision:'include',record}]});
      expect(res.status).toBe(201);
      expect(res.body.data.rows[1]).toMatchObject({decision:'include',duplicateCandidates:expect.arrayContaining([{clientRowId:'first',match:'exact'}])});
      expect(res.body.data.selectedCount).toBe(2);
    } finally {db.close();}
  });
  test('expired preview rejects commit, while a committed retry remains valid after expiry', async () => {
    const {db,agent,record}=await setup();
    try {
      const p=(await agent.post('/api/v1/imports/preview').send({rows:[{clientRowId:'r',decision:'include',record}]})).body.data;
      const body={approvalAcknowledged:true,payloadHash:p.payloadHash,idempotencyKey:'expiry'};
      db.prepare('UPDATE import_previews SET expires_at = ? WHERE id = ?').run('2000-01-01T00:00:00Z',p.id);
      expect((await agent.post(`/api/v1/imports/${p.id}/commit`).send(body)).status).toBe(409);
      expect(db.prepare('SELECT count(*) AS n FROM transactions').get()).toEqual({n:0});
      const fresh=(await agent.post('/api/v1/imports/preview').send({rows:[{clientRowId:'r',decision:'include',record}]})).body.data;
      const retry={...body,payloadHash:fresh.payloadHash};
      const first=await agent.post(`/api/v1/imports/${fresh.id}/commit`).send(retry);expect(first.status).toBe(200);
      db.prepare('UPDATE import_previews SET expires_at = ? WHERE id = ?').run('2000-01-01T00:00:00Z',fresh.id);
      expect((await agent.post(`/api/v1/imports/${fresh.id}/commit`).send(retry)).body).toEqual(first.body);
    } finally {db.close();}
  });
  test('AC11 SQLite failure on the second insert rolls back the first insert and batch metadata', async () => {
    const {db,agent,record}=await setup();
    try {
      const p=(await agent.post('/api/v1/imports/preview').send({rows:[{clientRowId:'first',decision:'include',record},{clientRowId:'second',decision:'include',record:{...record,description:'Reject me'}}]})).body.data;
      db.exec("CREATE TRIGGER test_failure BEFORE INSERT ON transactions WHEN NEW.description = 'Reject me' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
      expect((await agent.post(`/api/v1/imports/${p.id}/commit`).send({approvalAcknowledged:true,payloadHash:p.payloadHash,idempotencyKey:'atomic'})).status).toBe(500);
      expect(db.prepare('SELECT count(*) AS n FROM transactions').get()).toEqual({n:0});
      expect(db.prepare('SELECT count(*) AS n FROM import_batches').get()).toEqual({n:0});
    } finally {db.close();}
  });
});
