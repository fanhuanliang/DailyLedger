import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

function configuration(): {origin:string;token:string} {
  const rawUrl = process.env.API_URL;
  const token = process.env.MCP_TOKEN;
  if (!rawUrl || !token || /[\r\n]/.test(token)) throw new Error('Configure API_URL and MCP_TOKEN before starting the bridge.');
  const url = new URL(rawUrl);
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('API_URL must be an HTTP(S) origin without credentials or a path.');
  return {origin:url.origin,token};
}
function isObject(value:unknown): value is Record<string,unknown> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
function text(value:unknown, isError=false): CallToolResult {
  return {content:[{type:'text',text:JSON.stringify(value)}],...(isError?{isError:true}:{})};
}
async function start() {
  const {origin,token}=configuration();
  const server = new McpServer({name:'dailyledger',version:'0.1.0'});
  async function request(method:string,path:string,body?:unknown): Promise<CallToolResult> {
    try {
      const response = await fetch(origin+'/api/v1'+path,{method,headers:{Authorization:'Bearer '+token,...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});
      const result:unknown=await response.json();
      if (!isObject(result)) return text({error:{code:'INVALID_RESPONSE',message:'API returned an invalid response.'}},true);
      if (!response.ok) {
        const error=result.error;
        if (isObject(error) && typeof error.code==='string' && typeof error.message==='string') return text({error:{code:error.code,message:error.message,...(isObject(error.fields)?{fields:error.fields}:{})}},true);
        return text({error:{code:'API_ERROR',message:'API request failed.'}},true);
      }
      if (!Object.hasOwn(result,'data')) return text({error:{code:'INVALID_RESPONSE',message:'API success response omitted data.'}},true);
      return text(result);
    } catch { return text({error:{code:'API_UNAVAILABLE',message:'API request could not complete. For import retries reuse the original preview, payload hash, and idempotency key.'}},true); }
  }
  function query(params:Record<string,unknown>): string {
    const values=new URLSearchParams();
    for(const [key,value] of Object.entries(params))if(value!==undefined)values.set(key,String(value));
    const suffix=values.toString(); return suffix?'?'+suffix:'';
  }
  const read={readOnlyHint:true,destructiveHint:false,openWorldHint:false};
  const write={readOnlyHint:false,destructiveHint:true,openWorldHint:false};
  const positiveCents=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
  const revision=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
  const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const id=z.string().uuid();
  const page=z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional();
  const pageSize=z.number().int().min(1).max(200).optional();
  const record=z.object({date,description:z.string().min(1),type:z.enum(['income','expense','refund','transfer']),amountCents:positiveCents,accountId:id,destinationAccountId:id.nullable().optional(),categoryId:id.nullable().optional(),notes:z.string().nullable().optional()}).strict();
  const filters={dateFrom:date.optional(),dateTo:date.optional(),text:z.string().optional(),categoryId:id.optional(),accountId:id.optional(),type:z.enum(['income','expense','refund','transfer']).optional(),page,pageSize};
  server.registerTool('list_accounts',{description:'Read paginated accounts and computed balances. Archived accounts remain available for history; request includeArchived to see them. No ledger changes.',inputSchema:z.object({includeArchived:z.boolean().optional(),asOfDate:date.optional(),page,pageSize}).strict(),annotations:read},async(params)=>request('GET','/accounts'+query(params)));
  server.registerTool('list_categories',{description:'Read paginated income/expense categories. No ledger changes.',inputSchema:z.object({includeArchived:z.boolean().optional(),page,pageSize}).strict(),annotations:read},async(params)=>request('GET','/categories'+query(params)));
  server.registerTool('list_transactions',{description:'Read paginated ledger records with inclusive filters. No ledger changes.',inputSchema:z.object(filters).strict(),annotations:read},async(params)=>request('GET','/transactions'+query(params)));
  server.registerTool('get_transaction',{description:'Read one ledger record by ID. No ledger changes.',inputSchema:z.object({id}).strict(),annotations:read},async(params)=>request('GET','/transactions/'+encodeURIComponent(params.id)));
  server.registerTool('get_summary',{description:'Read income, net expenses and money left over for inclusive dates (default current household month). Transfers/opening balances excluded. No ledger changes.',inputSchema:z.object({dateFrom:date.optional(),dateTo:date.optional()}).strict(),annotations:read},async(params)=>request('GET','/reports/overview'+query(params)));
  server.registerTool('preview_import',{description:'Create a normalized review preview only; inserts zero transactions. Supply stable row IDs, explicit include/skip decisions and uncertainty notes. Show the exact selected records, duplicate hints and totals to the user and obtain approval before commit_import. Changed values require a new preview. Never send original document text, files or images.',inputSchema:z.object({rows:z.array(z.object({clientRowId:z.string().min(1).max(200),decision:z.enum(['include','skip']),record:record.partial(),uncertaintyNotes:z.array(z.string().max(500)).max(20).optional()}).strict()).min(1).max(200)}).strict(),annotations:{...write,destructiveHint:false}},async(params)=>request('POST','/imports/preview',params));
  server.registerTool('commit_import',{description:'CHANGES THE LEDGER atomically by inserting exactly the included preview rows. First call preview_import, show the selected values/totals, and obtain explicit approval of that exact preview. approvalAcknowledged asserts that approval; it does not independently prove consent. Send its unchanged hash and a unique idempotency key. Unchanged retries MUST reuse all three identifiers; changed or stale values need a new preview.',inputSchema:z.object({previewId:id,payloadHash:z.string().regex(/^[a-f0-9]{64}$/),idempotencyKey:z.string().min(1).max(200),approvalAcknowledged:z.literal(true)}).strict(),annotations:{...write,idempotentHint:true}},async({previewId,...body})=>request('POST','/imports/'+encodeURIComponent(previewId)+'/commit',body));
  server.registerTool('create_transaction',{description:'CHANGES THE LEDGER: create one explicitly requested manual entry. Require manualEntryAcknowledged=true. Never use this tool for extracted or imported document rows: use preview_import then approved commit_import.',inputSchema:record.extend({manualEntryAcknowledged:z.literal(true)}).strict(),annotations:write},async({manualEntryAcknowledged:_,...body})=>request('POST','/transactions',body));
  server.registerTool('update_transaction',{description:'CHANGES THE LEDGER and recalculates totals: correct an existing record using its current expectedRevision. Explain the total change to the user before applying; stale edits return409. Preserve original account/category links when correcting archived history.',inputSchema:record.extend({id,expectedRevision:revision}).strict(),annotations:write},async({id,...body})=>request('PATCH','/transactions/'+encodeURIComponent(id),body));
  const year=z.number().int().min(1).max(9999);
  const budgetRevision=z.union([revision,z.null()]);
  const limit=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
  server.registerTool('get_budget',{description:'Read one calendar year budget, independent overall/category spending and remaining. Not set differs from zero. No changes.',inputSchema:z.object({year}).strict(),annotations:read},async({year})=>request('GET','/budgets/'+String(year).padStart(4,'0')));
  server.registerTool('save_budget',{description:'CHANGES PLANNING DATA for the selected year only. Set optional overall and complete category limits independently; null overall or absent category rows mean Not set, zero is valid. Send loaded expectedRevision (explicit null only for a new unsaved year). Account balances/history are unchanged.',inputSchema:z.object({year,expectedRevision:budgetRevision,overallLimitCents:limit.nullable(),categoryLimits:z.array(z.object({categoryId:id,limitCents:limit}).strict())}).strict(),annotations:write},async({year,...body})=>request('PUT','/budgets/'+String(year).padStart(4,'0'),body));
  server.registerTool('copy_budget',{description:'CHANGES PLANNING DATA only in the target year. Copy source year limits; existing target values require explicit overwrite=true approval. Source year and financial records stay unchanged. Use the loaded target expectedRevision (null only for a new year).',inputSchema:z.object({year,sourceYear:year,overwrite:z.boolean(),expectedRevision:budgetRevision}).strict(),annotations:write},async({year,...body})=>request('POST','/budgets/'+String(year).padStart(4,'0')+'/copy',body));
  await server.connect(new StdioServerTransport());
}
start().catch(()=>{console.error('DailyLedger MCP could not start. Check API_URL and MCP_TOKEN configuration.');process.exitCode=1;});
