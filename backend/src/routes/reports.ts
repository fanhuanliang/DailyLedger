import {Router} from 'express';
import type Database from 'better-sqlite3';
import {getSummary} from '../services/summaryService';
import {getReport,getInsights,getYearComparison,exportTransactions} from '../services/reportsService';
export function reportsRouter(db: Database.Database): Router {
  const router=Router();
  router.get('/overview',(req,res)=>res.json({data:getSummary(db,req.query as Record<string,unknown>)}));
  for (const kind of ['categories','trends','balances'] as const) router.get('/'+kind,(req,res)=>res.json({data:getReport(db,kind,req.query)}));
  router.get('/insights',(req,res)=>res.json({data:getInsights(db,req.query)}));
  router.get('/year-comparison',(req,res)=>res.json({data:getYearComparison(db,req.query)}));
  return router;
}
export function exportsRouter(db:Database.Database):Router {
  const router=Router();
  router.get('/transactions.csv',(req,res)=>{
    const csv=exportTransactions(db,req.query);
    res.set('Cache-Control','no-store');
    res.set('Content-Disposition','attachment; filename="dailyledger-records.csv"');
    res.type('text/csv').send(csv);
  });
  return router;
}
