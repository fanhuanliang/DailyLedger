import {buildAuthorizedTestApp} from './helpers/testApp';
describe('AC8 annual budget API',()=>{
  test('unset limits remain distinct from explicit zero and progress is independently calculated',async()=>{
    const {db,agent}=buildAuthorizedTestApp();try{
      const account=(await agent.post('/api/v1/accounts').send({name:'Checking',type:'checking',openingDate:'2026-01-01',openingBalanceCents:100000})).body.data;
      const category=(await agent.post('/api/v1/categories').send({name:'Groceries',kind:'expense'})).body.data;
      await agent.post('/api/v1/transactions').send({date:'2026-01-05',description:'Test expense',type:'expense',amountCents:3000,accountId:account.id,categoryId:category.id});
      const empty=await agent.get('/api/v1/budgets/2026');expect(empty.status).toBe(200);expect(empty.body.data).toMatchObject({year:2026,revision:null,overallLimitCents:null,netSpendingCents:3000,overallRemainingCents:null});
      const saved=await agent.put('/api/v1/budgets/2026').send({expectedRevision:null,overallLimitCents:10000,categoryLimits:[{categoryId:category.id,limitCents:0}]});
      expect(saved.status).toBe(200);expect(saved.body.data).toMatchObject({revision:1,overallLimitCents:10000,overallRemainingCents:7000,categoryRows:[{categoryId:category.id,name:'Groceries',limitCents:0,netSpendingCents:3000,remainingCents:-3000}]});
      expect((await agent.get('/api/v1/budgets/2025')).body.data).toMatchObject({revision:null,overallLimitCents:null,netSpendingCents:0});
    }finally{db.close();}
  });
  test('AC8 copying changes only the target year and existing values require explicit overwrite',async()=>{
    const {db,agent}=buildAuthorizedTestApp();try{
      const category=(await agent.post('/api/v1/categories').send({name:'Test expense',kind:'expense'})).body.data;
      const source=(await agent.put('/api/v1/budgets/2025').send({expectedRevision:null,overallLimitCents:10000,categoryLimits:[{categoryId:category.id,limitCents:2000}]})).body.data;
      const copy=await agent.post('/api/v1/budgets/2026/copy').send({sourceYear:2025,overwrite:false,expectedRevision:null});
      expect(copy.status).toBe(200);expect(copy.body.data.overallLimitCents).toBe(10000);
      expect((await agent.get('/api/v1/budgets/2025')).body.data).toEqual(source);
      expect((await agent.post('/api/v1/budgets/2026/copy').send({sourceYear:2025,overwrite:false,expectedRevision:1})).status).toBe(409);
      expect((await agent.post('/api/v1/budgets/2026/copy').send({sourceYear:2025,overwrite:true,expectedRevision:1})).body.data.revision).toBe(2);
      expect((await agent.get('/api/v1/budgets/2025')).body.data).toEqual(source);
    }finally{db.close();}
  });
  test('stale edits and invalid cents/category kinds cannot mutate a budget',async()=>{
    const {db,agent}=buildAuthorizedTestApp();try{
      const income=(await agent.post('/api/v1/categories').send({name:'Salary',kind:'income'})).body.data;
      const body={expectedRevision:null,overallLimitCents:0,categoryLimits:[]};
      expect((await agent.put('/api/v1/budgets/2026').send(body)).status).toBe(200);
      expect((await agent.put('/api/v1/budgets/2026').send({...body,overallLimitCents:1000})).status).toBe(409);
      for(const value of [-1,1.5,Number.MAX_SAFE_INTEGER+1])expect((await agent.put('/api/v1/budgets/2026').send({...body,expectedRevision:1,overallLimitCents:value})).status).toBe(400);
      expect((await agent.put('/api/v1/budgets/2026').send({...body,expectedRevision:1,categoryLimits:[{categoryId:income.id,limitCents:100}]})).status).toBe(422);
      expect((await agent.get('/api/v1/budgets/2026')).body.data).toMatchObject({revision:1,overallLimitCents:0});
    }finally{db.close();}
  });
  test('copy/save validates years, body shapes, source availability and required revision',async()=>{
    const {db,agent}=buildAuthorizedTestApp();try{
      for(const year of ['no','2026.5','0000'])expect((await agent.get('/api/v1/budgets/'+year)).status).toBe(400);
      expect((await agent.put('/api/v1/budgets/2026').send({overallLimitCents:100,categoryLimits:[]})).status).toBe(400);
      expect((await agent.post('/api/v1/budgets/2026/copy').send({sourceYear:2025,overwrite:false,expectedRevision:null})).status).toBe(404);
      expect((await agent.post('/api/v1/budgets/2026/copy').send({sourceYear:2026,overwrite:false,expectedRevision:null})).status).toBe(400);
    }finally{db.close();}
  });

  test('AC8 failure during copy rolls back target limits and preserves the source',async()=>{
    const {db,agent}=buildAuthorizedTestApp();try{
      const first=(await agent.post('/api/v1/categories').send({name:'First',kind:'expense'})).body.data;
      const second=(await agent.post('/api/v1/categories').send({name:'Second',kind:'expense'})).body.data;
      const limits=[{categoryId:first.id,limitCents:100},{categoryId:second.id,limitCents:200}];
      const source=(await agent.put('/api/v1/budgets/2025').send({expectedRevision:null,overallLimitCents:1000,categoryLimits:limits})).body.data;
      const target=(await agent.put('/api/v1/budgets/2026').send({expectedRevision:null,overallLimitCents:500,categoryLimits:limits.map(row=>({...row,limitCents:50}))})).body.data;
      db.exec("CREATE TRIGGER reject_copy BEFORE UPDATE ON category_budgets WHEN NEW.year=2026 AND NEW.category_id=(SELECT id FROM categories WHERE name='Second') BEGIN SELECT RAISE(ABORT,'synthetic copy failure'); END");
      expect((await agent.post('/api/v1/budgets/2026/copy').send({sourceYear:2025,overwrite:true,expectedRevision:1})).status).toBe(500);
      expect((await agent.get('/api/v1/budgets/2026')).body.data).toEqual(target);
      expect((await agent.get('/api/v1/budgets/2025')).body.data).toEqual(source);
    }finally{db.close();}
  });
  test('unsafe computed remaining rejects and rolls back the proposed budget',async()=>{
    const {db,agent}=buildAuthorizedTestApp();try{
      const account=(await agent.post('/api/v1/accounts').send({name:'Test',type:'cash',openingDate:'2026-01-01',openingBalanceCents:0})).body.data;
      const category=(await agent.post('/api/v1/categories').send({name:'Test refund',kind:'expense'})).body.data;
      await agent.post('/api/v1/transactions').send({date:'2026-01-05',description:'Synthetic boundary',type:'refund',amountCents:Number.MAX_SAFE_INTEGER,accountId:account.id,categoryId:category.id});
      expect((await agent.put('/api/v1/budgets/2026').send({expectedRevision:null,overallLimitCents:Number.MAX_SAFE_INTEGER,categoryLimits:[]})).status).toBe(422);
      expect(db.prepare('SELECT count(*) AS n FROM annual_budgets').get()).toEqual({n:0});
    }finally{db.close();}
  });
});
