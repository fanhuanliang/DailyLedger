import {buildAuthorizedTestApp} from './helpers/testApp';
describe('API import request limits and shared summary',()=>{
  test('oversized JSON is a client error with no ledger writes',async()=>{
    const {db,agent}=buildAuthorizedTestApp();try{
      const res=await agent.post('/api/v1/imports/preview').send({rows:[],notes:'x'.repeat(150000)});
      expect(res.status).toBe(400);expect(res.body.error.code).toBe('REQUEST_TOO_LARGE');
      expect(db.prepare('SELECT count(*) AS n FROM transactions').get()).toEqual({n:0});
    }finally{db.close();}
  });
  test('AC6 summary agrees with all filtered Records beyond the first page',async()=>{
    const {db,agent}=buildAuthorizedTestApp();try{
      const account=(await agent.post('/api/v1/accounts').send({name:'Checking',type:'checking',openingDate:'2026-01-01',openingBalanceCents:100000})).body.data;
      const category=(await agent.post('/api/v1/categories').send({name:'Test groceries',kind:'expense'})).body.data;
      for(let i=0;i<55;i++)await agent.post('/api/v1/transactions').send({date:'2026-01-05',description:'Test',type:'expense',amountCents:100,accountId:account.id,categoryId:category.id});
      const res=await agent.get('/api/v1/reports/overview?dateFrom=2026-01-01&dateTo=2026-01-31');
      expect(res.status).toBe(200);expect(res.body.data).toMatchObject({dateFrom:'2026-01-01',dateTo:'2026-01-31',incomeCents:0,netExpensesCents:5500,moneyLeftOverCents:-5500,recordCount:55});
      expect((await agent.get('/api/v1/reports/overview?dateFrom=2026-02-31&dateTo=2026-03-01')).status).toBe(400);
    }finally{db.close();}
  });
});
