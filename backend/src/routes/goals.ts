import {Router} from 'express';
import type Database from 'better-sqlite3';
import {listGoals,createGoal,updateGoal,changeGoalStatus} from '../services/goalsService';
export function goalsRouter(db:Database.Database):Router {
  const router=Router();
  router.get('/',(req,res)=>{const result=listGoals(db,req.query);res.json({data:result.items,meta:result.meta});});
  router.post('/',(req,res)=>res.status(201).json({data:createGoal(db,req.body)}));
  router.patch('/:id',(req,res)=>res.json({data:updateGoal(db,req.params.id,req.body)}));
  router.post('/:id/complete',(req,res)=>res.json({data:changeGoalStatus(db,req.params.id,req.body,'completed')}));
  router.post('/:id/archive',(req,res)=>res.json({data:changeGoalStatus(db,req.params.id,req.body,'archived')}));
  return router;
}
