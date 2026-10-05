import {buildAuthorizedTestApp} from './helpers/testApp';
describe('AC14 savings goals and current progress',()=>{
  async function setup(balance=200000){const app=buildAuthorizedTestApp();const account=(await app.agent.post('/api/v1/accounts').send({name:'Savings',type:'savings',openingDate:'2026-01-01',openingBalanceCents:balance})).body.data;return {...app,account,input:{name:'Emergency fund',targetCents:500000,savingsAccountId:account.id,deadline:null}};}
  test('existing savings balance contributes without creating financial records',async()=>{
    const {db,agent,account,input}=await setup();try{
      const created=await agent.post('/api/v1/goals').send(input);expect(created.status).toBe(201);expect(created.body.data).toMatchObject({targetCents:500000,progressCents:200000,percentage:40,surplusCents:0,status:'active',revision:1});
      expect(db.prepare('SELECT count(*) AS n FROM transactions').get()).toEqual({n:0});
      expect((await agent.get('/api/v1/accounts')).body.data.find((row:{id:string})=>row.id===account.id).balance_cents).toBe(200000);
    }finally{db.close();}
  });
  test('AC14 second active goal on same account rejected; completion permits a new active goal',async()=>{
    const {db,agent,input}=await setup();try{
      const first=(await agent.post('/api/v1/goals').send(input)).body.data;
      expect((await agent.post('/api/v1/goals').send({...input,name:'Second'})).status).toBe(422);
      expect((await agent.post(`/api/v1/goals/${first?.id}/complete`).send({expectedRevision:1})).status).toBe(200);
      expect((await agent.post('/api/v1/goals').send({...input,name:'Second'})).status).toBe(201);
      expect(db.prepare('SELECT count(*) AS n FROM transactions').get()).toEqual({n:0});
    }finally{db.close();}
  });
  test.each([{balance:-100,target:100,progress:0,percentage:0,surplus:0},{balance:200,target:100,progress:200,percentage:100,surplus:100}])('clamps negative progress and caps percentages with separate surplus ($balance)',async({balance,target,progress,percentage,surplus})=>{
    const {db,agent,input}=await setup(balance);try{const res=await agent.post('/api/v1/goals').send({...input,targetCents:target});expect(res.status).toBe(201);expect(res.body.data).toMatchObject({progressCents:progress,percentage,surplusCents:surplus});}finally{db.close();}
  });
  test('editing/archiving requires current revision and preserves account history',async()=>{
    const {db,agent,input}=await setup();try{
      const first=(await agent.post('/api/v1/goals').send(input)).body.data;
      const updated=await agent.patch(`/api/v1/goals/${first?.id}`).send({name:'Updated',targetCents:600000,expectedRevision:1});expect(updated.status).toBe(200);expect(updated.body.data.revision).toBe(2);
      expect((await agent.patch(`/api/v1/goals/${first?.id}`).send({name:'Stale',expectedRevision:1})).status).toBe(409);
      expect((await agent.post(`/api/v1/goals/${first?.id}/archive`).send({expectedRevision:2})).status).toBe(200);
      expect((await agent.get('/api/v1/goals')).body.data).toEqual([]);
      expect((await agent.get('/api/v1/goals?includeArchived=true')).body.data[0]).toMatchObject({name:'Updated',status:'archived',revision:3});
      expect(db.prepare('SELECT opening_balance_cents FROM accounts').get()).toEqual({opening_balance_cents:200000});
    }finally{db.close();}
  });
  test('rejects zero/unsafe targets, invalid deadlines and non-savings or archived accounts',async()=>{
    const {db,agent,input,account}=await setup();try{
      for(const targetCents of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1])expect((await agent.post('/api/v1/goals').send({...input,targetCents})).status).toBe(400);
      expect((await agent.post('/api/v1/goals').send({...input,deadline:'2026-02-31'})).status).toBe(400);
      const checking=(await agent.post('/api/v1/accounts').send({name:'Checking',type:'checking',openingDate:'2026-01-01',openingBalanceCents:0})).body.data;
      expect((await agent.post('/api/v1/goals').send({...input,savingsAccountId:checking.id})).status).toBe(422);
      await agent.post(`/api/v1/accounts/${account.id}/archive`).send({expectedRevision:1});
      expect((await agent.post('/api/v1/goals').send(input)).status).toBe(422);
    }finally{db.close();}
  });
});
