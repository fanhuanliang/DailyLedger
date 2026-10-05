import type Database from 'better-sqlite3';
import {randomUUID} from 'node:crypto';
import {badRequest,conflict,notFound,unprocessable} from '../lib/errors';
import {requireExpectedRevision} from '../lib/validation';
import {computeNetExpenses} from './periodTotals';
import type {Transaction} from '../types/domain';

interface BudgetRow {year:number;overall_limit_cents:number|null;revision:number}
interface CategoryLimit {categoryId:string;limitCents:number}
export function parseBudgetYear(value:unknown):number {
  const text=String(value);
  if(!/^\d{4}$/.test(text)||Number(text)<1)throw badRequest('year must be a four-digit calendar year.');
  return Number(text);
}
function bodyObject(value:unknown,allowed:string[]):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value))throw badRequest('A JSON object is required.');
  const body=value as Record<string,unknown>;
  if(Object.keys(body).some(key=>!allowed.includes(key)))throw badRequest('Unexpected budget fields.');
  return body;
}
function nonnegativeCents(value:unknown):number {
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw badRequest('Budget limits must be nonnegative safe integer cents.');
  return value;
}
function expectedRevision(body:Record<string,unknown>):number|null {
  return body.expectedRevision===null?null:requireExpectedRevision(body);
}
export function computeBudgetRemaining(limit:number|null,netSpending:number):number|null {
  if(limit===null)return null;
  const result=BigInt(limit)-BigInt(netSpending);
  if(result>BigInt(Number.MAX_SAFE_INTEGER)||result < -BigInt(Number.MAX_SAFE_INTEGER))throw unprocessable('Budget remaining exceeds the supported integer-cent range.');
  return Number(result);
}
export function getBudget(db:Database.Database,year:number) {
  return db.transaction(()=>{
    const current=db.prepare('SELECT * FROM annual_budgets WHERE year=?').get(year) as BudgetRow|undefined;
    const prefix=String(year).padStart(4,'0');
    const records=db.prepare('SELECT * FROM transactions WHERE date BETWEEN ? AND ?').all(prefix+'-01-01',prefix+'-12-31') as Transaction[];
    function spending(categoryId?:string):number {
      try{return computeNetExpenses(records,categoryId);}
      catch{throw unprocessable('Annual spending exceeds the supported integer-cent range.');}
    }
    const categories=db.prepare(`SELECT c.id,c.name,c.archived_at,b.limit_cents FROM categories c LEFT JOIN category_budgets b ON b.category_id=c.id AND b.year=? WHERE c.kind='expense' ORDER BY c.name,c.id`).all(year) as {id:string;name:string;archived_at:string|null;limit_cents:number|null}[];
    const netSpendingCents=spending();
    const overallLimitCents=current?.overall_limit_cents??null;
    return {year,revision:current?.revision??null,overallLimitCents,netSpendingCents,overallRemainingCents:computeBudgetRemaining(overallLimitCents,netSpendingCents),categoryRows:categories.map(category=>{
      const netSpendingCents=spending(category.id);
      return {categoryId:category.id,name:category.name,archivedAt:category.archived_at,limitCents:category.limit_cents,netSpendingCents,remainingCents:computeBudgetRemaining(category.limit_cents,netSpendingCents)};
    })};
  })();
}
function checkRevision(db:Database.Database,year:number,expected:number|null):BudgetRow|undefined {
  const current=db.prepare('SELECT * FROM annual_budgets WHERE year=?').get(year) as BudgetRow|undefined;
  if((current?.revision??null)!==expected)throw conflict('Budget changed since it was loaded. Reload before saving.');
  return current;
}
function writeBudget(db:Database.Database,year:number,current:BudgetRow|undefined,overall:number|null,limits:CategoryLimit[]) {
  if(current)db.prepare("UPDATE annual_budgets SET overall_limit_cents=?,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE year=?").run(overall,year);
  else db.prepare('INSERT INTO annual_budgets(id,year,overall_limit_cents) VALUES(?,?,?)').run(randomUUID(),year,overall);
  const kept=new Set(limits.map(limit=>limit.categoryId));
  for(const row of db.prepare('SELECT category_id FROM category_budgets WHERE year=?').all(year) as {category_id:string}[])if(!kept.has(row.category_id))db.prepare('DELETE FROM category_budgets WHERE year=? AND category_id=?').run(year,row.category_id);
  const save=db.prepare(`INSERT INTO category_budgets(id,year,category_id,limit_cents) VALUES(?,?,?,?) ON CONFLICT(year,category_id) DO UPDATE SET limit_cents=excluded.limit_cents,revision=category_budgets.revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`);
  for(const limit of limits)save.run(randomUUID(),year,limit.categoryId,limit.limitCents);
}
export function saveBudget(db:Database.Database,year:number,value:unknown) {
  const body=bodyObject(value,['expectedRevision','overallLimitCents','categoryLimits']);
  const expected=expectedRevision(body);
  const overall=body.overallLimitCents===null?null:nonnegativeCents(body.overallLimitCents);
  if(!Array.isArray(body.categoryLimits))throw badRequest('categoryLimits must be an array.');
  const ids=new Set<string>();
  const limits=body.categoryLimits.map(value=>{
    const row=bodyObject(value,['categoryId','limitCents']);
    if(typeof row.categoryId!=='string'||ids.has(row.categoryId))throw badRequest('categoryId must be a unique expense category.');
    const category=db.prepare('SELECT kind FROM categories WHERE id=?').get(row.categoryId) as {kind:string}|undefined;
    if(!category||category.kind!=='expense')throw unprocessable('Budget category must be an existing expense category.');
    ids.add(row.categoryId);return {categoryId:row.categoryId,limitCents:nonnegativeCents(row.limitCents)};
  });
  return db.transaction(()=>{
    const current=checkRevision(db,year,expected);
    writeBudget(db,year,current,overall,limits);
    return getBudget(db,year);
  })();
}
export function copyBudget(db:Database.Database,year:number,value:unknown) {
  const body=bodyObject(value,['sourceYear','overwrite','expectedRevision']);
  if(typeof body.sourceYear!=='number'||!Number.isInteger(body.sourceYear))throw badRequest('sourceYear must be a calendar year number.');
  const sourceYear=parseBudgetYear(String(body.sourceYear).padStart(4,'0'));
  if(sourceYear===year)throw badRequest('Source and target year must differ.');
  if(typeof body.overwrite!=='boolean')throw badRequest('An explicit overwrite choice is required.');
  const expected=expectedRevision(body);
  return db.transaction(()=>{
    const source=db.prepare('SELECT * FROM annual_budgets WHERE year=?').get(sourceYear) as BudgetRow|undefined;
    if(!source)throw notFound('Source year has no saved budget.');
    const current=checkRevision(db,year,expected);
    const hasLimits=Boolean(current && (current.overall_limit_cents!==null || db.prepare('SELECT 1 FROM category_budgets WHERE year=?').get(year)));
    if(hasLimits&&!body.overwrite)throw conflict('Target year already has limits. Explicit overwrite is required.','OVERWRITE_REQUIRED');
    const limits=db.prepare('SELECT category_id AS categoryId,limit_cents AS limitCents FROM category_budgets WHERE year=?').all(sourceYear) as CategoryLimit[];
    writeBudget(db,year,current,source.overall_limit_cents,limits);
    return getBudget(db,year);
  })();
}
