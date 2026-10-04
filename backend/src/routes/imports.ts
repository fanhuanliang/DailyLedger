import { Router } from 'express';
import type Database from 'better-sqlite3';
import { previewImport, commitImport } from '../services/importsService';
export function importsRouter(db: Database.Database): Router {
  const router = Router();
  router.post('/preview',(req,res)=>res.status(201).json({data:previewImport(db,req.body)}));
  router.post('/:previewId/commit',(req,res)=>res.json({data:commitImport(db,req.params.previewId,req.body)}));
  return router;
}
