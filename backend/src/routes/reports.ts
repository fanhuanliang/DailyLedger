import {Router} from 'express';
import type Database from 'better-sqlite3';
import {getSummary} from '../services/summaryService';
export function reportsRouter(db: Database.Database): Router {
  const router=Router();
  router.get('/overview',(req,res)=>res.json({data:getSummary(db,req.query as Record<string,unknown>)}));
  return router;
}
