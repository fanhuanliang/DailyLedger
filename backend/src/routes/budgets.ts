import {Router} from 'express';
import type Database from 'better-sqlite3';
import {parseBudgetYear,getBudget,saveBudget,copyBudget} from '../services/budgetsService';
export function budgetsRouter(db:Database.Database):Router {
  const router=Router();
  router.get('/:year',(req,res)=>res.json({data:getBudget(db,parseBudgetYear(req.params.year))}));
  router.put('/:year',(req,res)=>res.json({data:saveBudget(db,parseBudgetYear(req.params.year),req.body)}));
  router.post('/:year/copy',(req,res)=>res.json({data:copyBudget(db,parseBudgetYear(req.params.year),req.body)}));
  return router;
}
