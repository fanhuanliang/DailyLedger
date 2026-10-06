import {buildAuthorizedTestApp} from './helpers/testApp';
import {getHouseholdToday} from '../src/lib/householdTime';
describe('AC5/AC6/AC7 insight reports and filtered CSV',()=>{
 async function setup(){const app=buildAuthorizedTestApp();const account=(await app.agent.post('/api/v1/accounts').send({name:'Checking',type:'checking',openingDate:'2023-01-01',openingBalanceCents:10000})).body.data;const expense=(await app.agent.post('/api/v1/categories').send({name:'Groceries',kind:'expense'})).body.data;const income=(await app.agent.post('/api/v1/categories').send({name:'Salary',kind:'income'})).body.data;const add=async(date:string,type:string,amountCents:number,description=type)=>{const result=await app.agent.post('/api/v1/transactions').send({date,type,amountCents,description,accountId:account.id,categoryId:type==='income'?income.id:expense.id});expect(result.status).toBe(201);return result.body.data;};return {...app,account,expense,income,add};}
 test('AC5/AC6 category/trend detail reconciles to Records and retains negative refunds without percentages',async()=>{
  const {db,agent,add}=await setup();try{await add('2024-01-10','income',10000);await add('2024-01-11','expense',2000);await add('2024-02-12','refund',3000);
   const query='?dateFrom=2024-01-01&dateTo=2024-02-29';const categories=await agent.get('/api/v1/reports/categories'+query);expect(categories.status).toBe(200);expect(categories.body.data).toMatchObject({totalNetExpensesCents:-1000,rows:[{name:'Groceries',netExpensesCents:-1000,percentage:null}]});
   const trends=await agent.get('/api/v1/reports/trends'+query);expect(trends.status).toBe(200);expect(trends.body.data.rows).toMatchObject([{month:'2024-01',incomeCents:10000,netExpensesCents:2000},{month:'2024-02',incomeCents:0,netExpensesCents:-3000}]);const overview=(await agent.get('/api/v1/reports/overview'+query)).body.data;expect(trends.body.data.rows.reduce((sum:number,row:{netExpensesCents:number})=>sum+row.netExpensesCents,0)).toBe(overview.netExpensesCents);expect(overview.moneyLeftOverCents).toBe(11000);expect((await agent.get('/api/v1/transactions'+query)).body.meta.total).toBe(3);
  }finally{db.close();}
 });
 test('historical balance report includes archived accounts and marks before-opening unavailable',async()=>{
  const {db,agent,account,add}=await setup();try{await add('2024-01-10','expense',2000);await agent.post(`/api/v1/accounts/${account.id}/archive`).send({expectedRevision:1});
   const report=await agent.get('/api/v1/reports/balances?dateFrom=2024-01-01&dateTo=2024-01-31');expect(report.status).toBe(200);expect(report.body.data.rows[0]).toMatchObject({id:account.id,balance_cents:8000,balance_as_of:'2024-01-31'});
   expect((await agent.get('/api/v1/reports/balances?dateFrom=2022-01-01&dateTo=2022-12-31')).body.data.rows[0].balance_cents).toBe('not_available');
  }finally{db.close();}
 });
 test('AC7 matched prior-year period clamps February29 and compares calendar years explicitly',async()=>{
  const {db,agent,add}=await setup();try{await add('2024-02-29','income',20000);await add('2023-02-28','income',10000);
   const matched=await agent.get('/api/v1/reports/year-comparison?dateFrom=2024-01-01&dateTo=2024-02-29');expect(matched.status).toBe(200);expect(matched.body.data.current).toMatchObject({dateFrom:'2024-01-01',dateTo:'2024-02-29',incomeCents:20000});expect(matched.body.data.previous).toMatchObject({dateFrom:'2023-01-01',dateTo:'2023-02-28',incomeCents:10000});
   const today=getHouseholdToday(db),year=today.slice(0,4);const ytd=(await agent.get('/api/v1/reports/year-comparison')).body.data;expect(ytd.current.dateTo).toBe(today);expect(ytd.current.dateFrom).toBe(year+'-01-01');
   const calendar=(await agent.get('/api/v1/reports/year-comparison?mode=calendar&year='+year)).body.data;expect(calendar.current.dateTo).toBe(year+'-12-31');expect(calendar.currentYearIncomplete).toBe(today<year+'-12-31');
  }finally{db.close();}
 });
 test('insight snapshot identifies separate budget years and CURRENT goals and due reminders',async()=>{
  const {db,agent,add}=await setup();try{await add('2024-01-10','income',10000);const report=await agent.get('/api/v1/reports/insights?dateFrom=2023-12-01&dateTo=2024-01-31');expect(report.status).toBe(200);expect(report.body.data.budgets.map((row:{year:number})=>row.year)).toEqual([2023,2024]);expect(report.body.data.overview.incomeCents).toBe(10000);expect(report.body.data.goals).toEqual([]);expect(report.body.data.reminders).toEqual([]);expect(report.body.data.balances.asOfDate).toBe('2024-01-31');
  }finally{db.close();}
 });
 test('AC6 CSV shares inclusive Records filters and escapes formulas, quotes and multiline text',async()=>{
  const {db,agent,add}=await setup();try{await add('2024-01-10','expense',1234,'=SUM(1,2)');await add('2024-01-11','expense',1234,'Quoted "value"\nnext line');await add('2024-02-01','expense',999,'Outside');
   const csv=await agent.get('/api/v1/exports/transactions.csv?dateFrom=2024-01-01&dateTo=2024-01-31&type=expense');expect(csv.status).toBe(200);expect(csv.headers['content-type']).toContain('text/csv');expect(csv.text).toContain("'=SUM(1,2)");expect(csv.text).toContain('Quoted ""value""\nnext line');expect(csv.text).toContain('12.34');expect(csv.text).not.toContain('Outside');expect(csv.headers['content-disposition']).toContain('attachment');
   expect((await agent.get('/api/v1/exports/transactions.csv?dateFrom=2024-02-31')).status).toBe(400);
  }finally{db.close();}
 });
 test('AC6 reports and CSV include every filtered page, reject malformed ranges and guard overflow',async()=>{
  const {db,agent,account,expense,add}=await setup();try{
   for(let i=0;i<205;i++) await add('2024-01-10','expense',100,'Matching purchase');
   await add('2024-01-11','expense',500,'Other purchase');
   const query='?dateFrom=2024-01-01&dateTo=2024-01-31&text=Matching&type=expense';
   const report=await agent.get('/api/v1/reports/categories'+query);expect(report.status).toBe(200);expect(report.body.data.totalNetExpensesCents).toBe(20500);expect(report.body.data.rows[0].recordCount).toBe(205);
   const csv=await agent.get('/api/v1/exports/transactions.csv'+query);expect(csv.status).toBe(200);expect(csv.text.match(/Matching purchase/g)?.length).toBe(205);expect(csv.text).not.toContain('Other purchase');
   expect((await agent.get('/api/v1/reports/insights?dateFrom=2024-01-01')).status).toBe(400);
   expect((await agent.get('/api/v1/reports/categories?dateFrom=2024-02-31&dateTo=2024-03-01')).status).toBe(400);
   expect((await agent.get('/api/v1/reports/year-comparison?mode=calendar&year=2024&year=2025')).status).toBe(400);
   expect((await agent.get('/api/v1/reports/year-comparison?dateFrom=0001-01-01&dateTo=0001-12-31')).status).toBe(400);
   await add('2024-02-01','expense',Number.MAX_SAFE_INTEGER,'Maximum');await add('2024-02-02','expense',1,'Overflow');
   expect((await agent.get('/api/v1/reports/categories?dateFrom=2024-02-01&dateTo=2024-02-28')).status).toBe(422);
  }finally{db.close();}
 });
});
