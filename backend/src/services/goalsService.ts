import type Database from 'better-sqlite3';
import {randomUUID} from 'node:crypto';
import {badRequest,conflict,notFound,unprocessable} from '../lib/errors';
import {requireExpectedRevision} from '../lib/validation';
import {isValidCalendarDate} from '../lib/calendarDate';
import {getHouseholdToday} from '../lib/householdTime';
import {parsePageRequest,paginationMeta,parseIncludeArchived} from '../lib/pagination';
import {getAccount} from './accountsService';
import {computeAccountBalance} from './balances';
import type {Transaction} from '../types/domain';
interface GoalRow {id:string;name:string;target_cents:number;savings_account_id:string;deadline:string|null;status:'active'|'completed'|'archived';revision:number;created_at:string;updated_at:string}
function object(value:unknown,fields:string[]):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value))throw badRequest('A JSON object is required.');
  const body=value as Record<string,unknown>;
  if(Object.keys(body).some(key=>!fields.includes(key)))throw badRequest('Unexpected goal fields.');
  return body;
}
function goalRow(db:Database.Database,id:string):GoalRow {
  const row=db.prepare('SELECT * FROM savings_goals WHERE id=?').get(id) as GoalRow|undefined;
  if(!row)throw notFound('Goal not found.');return row;
}
export function computeGoalProgress(balance:number|null,target:number) {
  if(balance===null)return {progressCents:null,percentage:null,surplusCents:null};
  const progressCents=Math.max(0,balance);
  return {progressCents,percentage:Math.min(100,progressCents/target*100),surplusCents:Math.max(0,progressCents-target)};
}
function summary(db:Database.Database,row:GoalRow) {
  const asOfDate=getHouseholdToday(db),account=getAccount(db,row.savings_account_id);
  const transactions=db.prepare('SELECT * FROM transactions WHERE (account_id=? OR destination_account_id=?) AND date<=? ORDER BY date,created_at,id').all(account.id,account.id,asOfDate) as Transaction[];
  let balance:ReturnType<typeof computeAccountBalance>;
  try{balance=computeAccountBalance(account,transactions,asOfDate);}catch{throw unprocessable('Goal account balance exceeds the supported integer-cent range.');}
  return {id:row.id,name:row.name,targetCents:row.target_cents,savingsAccountId:row.savings_account_id,deadline:row.deadline,status:row.status,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at,asOfDate,...computeGoalProgress(typeof balance==='number'?balance:null,row.target_cents)};
}
function validate(db:Database.Database,body:Record<string,unknown>,current?:GoalRow) {
  const name=body.name===undefined?current?.name:body.name;
  const target=body.targetCents===undefined?current?.target_cents:body.targetCents;
  const accountId=body.savingsAccountId===undefined?current?.savings_account_id:body.savingsAccountId;
  const deadline=body.deadline===undefined?current?.deadline??null:body.deadline;
  if(typeof name!=='string'||!name.trim())throw badRequest('Goal name is required.');
  if(typeof target!=='number'||!Number.isSafeInteger(target)||target<=0)throw badRequest('Goal target must be positive safe integer cents.');
  if(deadline!==null&&(typeof deadline!=='string'||!isValidCalendarDate(deadline)))throw badRequest('Deadline must be a real YYYY-MM-DD date or null.');
  if(typeof accountId!=='string')throw badRequest('A savings account is required.');
  const account=db.prepare('SELECT type,archived_at FROM accounts WHERE id=?').get(accountId) as {type:string;archived_at:string|null}|undefined;
  if(!account||account.type!=='savings'||(account.archived_at!==null&&accountId!==current?.savings_account_id))throw unprocessable('Choose an active savings account.');
  const active=db.prepare("SELECT id FROM savings_goals WHERE savings_account_id=? AND status='active'").get(accountId) as {id:string}|undefined;
  if((!current||current.status==='active')&&active&&active.id!==current?.id)throw unprocessable('Only one active goal is allowed per savings account.');
  return {name:name.trim(),target,accountId,deadline};
}
export function listGoals(db:Database.Database,query:Record<string,unknown>) {
  const {page,pageSize}=parsePageRequest(query),includeArchived=parseIncludeArchived(query.includeArchived);
  return db.transaction(()=>{
    const where=includeArchived?'':"WHERE status!='archived'";
    const total=(db.prepare(`SELECT count(*) AS n FROM savings_goals ${where}`).get() as {n:number}).n;
    const rows=db.prepare(`SELECT * FROM savings_goals ${where} ORDER BY created_at,id LIMIT ? OFFSET ?`).all(pageSize,(page-1)*pageSize) as GoalRow[];
    return {items:rows.map(row=>summary(db,row)),meta:paginationMeta(page,pageSize,total)};
  })();
}
export function createGoal(db:Database.Database,value:unknown) {
  const body=object(value,['name','targetCents','savingsAccountId','deadline']);
  return db.transaction(()=>{
    const input=validate(db,body),id=randomUUID();
    db.prepare('INSERT INTO savings_goals(id,name,target_cents,savings_account_id,deadline) VALUES(?,?,?,?,?)').run(id,input.name,input.target,input.accountId,input.deadline);
    return summary(db,goalRow(db,id));
  })();
}
export function updateGoal(db:Database.Database,id:string,value:unknown) {
  const body=object(value,['name','targetCents','savingsAccountId','deadline','expectedRevision']),expected=requireExpectedRevision(body);
  return db.transaction(()=>{
    const current=goalRow(db,id);if(current.revision!==expected)throw conflict('Goal changed since it was loaded. Reload before saving.');
    const input=validate(db,body,current);
    db.prepare("UPDATE savings_goals SET name=?,target_cents=?,savings_account_id=?,deadline=?,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND revision=?").run(input.name,input.target,input.accountId,input.deadline,id,expected);
    return summary(db,goalRow(db,id));
  })();
}
export function changeGoalStatus(db:Database.Database,id:string,value:unknown,status:'completed'|'archived') {
  const body=object(value,['expectedRevision']),expected=requireExpectedRevision(body);
  return db.transaction(()=>{
    const current=goalRow(db,id);if(current.revision!==expected)throw conflict('Goal changed since it was loaded. Reload before saving.');
    if(current.status==='archived'||(status==='completed'&&current.status!=='active'))throw unprocessable('This goal cannot make that status change.');
    db.prepare("UPDATE savings_goals SET status=?,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND revision=?").run(status,id,expected);
    return summary(db,goalRow(db,id));
  })();
}
