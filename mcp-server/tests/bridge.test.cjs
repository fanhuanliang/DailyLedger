const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const path=require('node:path');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
const {openDatabase}=require('../../backend/dist/db/connection.js');
const {createApp}=require('../../backend/dist/app.js');
const {createAccount}=require('../../backend/dist/services/accountsService.js');
let db,server,client,transport,account,category;
const bearer='synthetic-mcp-test-token';
const headers=[];
before(async()=>{
  db=openDatabase(':memory:');
  account=createAccount(db,{name:'Test checking',type:'checking',openingDate:'2026-01-01',openingBalanceCents:0});
  category=db.prepare("SELECT * FROM categories WHERE name='Groceries'").get();
  const app=createApp(db,{mcpToken:bearer});
  server=http.createServer((req,res)=>{headers.push(req.headers.authorization);app(req,res);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  transport=new StdioClientTransport({command:process.execPath,args:[path.resolve(__dirname,'../dist/index.js')],env:{...process.env,API_URL:`http://127.0.0.1:${server.address().port}`,MCP_TOKEN:bearer},stderr:'pipe'});
  client=new Client({name:'dailyledger-test',version:'1.0.0'});
  await client.connect(transport);
});
after(async()=>{if(client)await client.close();if(server)await new Promise(r=>server.close(r));if(db)db.close();});
function data(result){assert.equal(result.isError,undefined);return JSON.parse(result.content[0].text).data;}
test('advertises every initial ledger tool with read/write side effects and review guidance',async()=>{
  const {tools}=await client.listTools();
  for(const name of ['list_accounts','list_categories','list_transactions','get_transaction','get_summary','preview_import','commit_import','create_transaction','update_transaction'])assert.ok(tools.some(t=>t.name===name),`Missing ${name}`);
  assert.equal(tools.find(t=>t.name==='list_accounts').annotations.readOnlyHint,true);
  assert.equal(tools.find(t=>t.name==='commit_import').annotations.readOnlyHint,false);
  assert.match(tools.find(t=>t.name==='create_transaction').description,/manual|import/i);
});
test('real stdio read goes through the token-authenticated HTTP API',async()=>{
  const result=data(await client.callTool({name:'list_accounts',arguments:{page:1}}));
  assert.equal(result[0].id,account.id);
  assert.ok(headers.length>0);assert.ok(headers.every(value=>value===`Bearer ${bearer}`));
});
test('AC11/AC12 real stdio preview, approved commit, retry and record read share one isolated ledger',async()=>{
  const record={date:'2026-01-05',description:'Synthetic groceries',type:'expense',amountCents:2000,accountId:account.id,categoryId:category.id};
  const preview=data(await client.callTool({name:'preview_import',arguments:{rows:[{clientRowId:'r1',decision:'include',record}]}}));
  assert.equal(db.prepare('SELECT count(*) AS n FROM transactions').get().n,0);
  assert.equal(preview.selectedCount,1);
  const args={previewId:preview.id,payloadHash:preview.payloadHash,idempotencyKey:'stdio-retry',approvalAcknowledged:true};
  const first=data(await client.callTool({name:'commit_import',arguments:args}));
  assert.equal(first.insertedCount,1);
  assert.deepEqual(data(await client.callTool({name:'commit_import',arguments:args})),first);
  assert.equal(db.prepare('SELECT count(*) AS n FROM transactions').get().n,1);
  const transaction=data(await client.callTool({name:'get_transaction',arguments:{id:first.insertedIds[0]}}));
  assert.equal(transaction.source,'mcp');assert.equal(transaction.amount_cents,2000);
  const list=data(await client.callTool({name:'list_transactions',arguments:{dateFrom:'2026-01-01',dateTo:'2026-01-31'}}));assert.equal(list.length,1);
});

test('invalid bridge credential is rejected by the API even on reads',async()=>{
  const other=new Client({name:'invalid-credential-test',version:'1.0.0'});
  const child=new StdioClientTransport({command:process.execPath,args:[path.resolve(__dirname,'../dist/index.js')],env:{...process.env,API_URL:`http://127.0.0.1:${server.address().port}`,MCP_TOKEN:'incorrect-token'},stderr:'pipe'});
  try {await other.connect(child);const result=await other.callTool({name:'list_accounts',arguments:{}});assert.equal(result.isError,true);assert.equal(JSON.parse(result.content[0].text).error.code,'MCP_AUTH_FAILED');}
  finally{await other.close();}
});

test('manual entry, revision-aware correction and summary use the shared API',async()=>{
  const salary=db.prepare("SELECT * FROM categories WHERE name='Salary'").get();
  const input={date:'2026-01-05',description:'Synthetic salary',type:'income',amountCents:50000,accountId:account.id,categoryId:salary.id};
  const noApproval=await client.callTool({name:'create_transaction',arguments:{...input,manualEntryAcknowledged:false}});assert.equal(noApproval.isError,true);
  const created=data(await client.callTool({name:'create_transaction',arguments:{...input,manualEntryAcknowledged:true}}));assert.equal(created.source,'manual');
  const updated=data(await client.callTool({name:'update_transaction',arguments:{...input,id:created.id,expectedRevision:created.revision,description:'Corrected synthetic salary'}}));assert.equal(updated.revision,2);
  const stale=await client.callTool({name:'update_transaction',arguments:{...input,id:created.id,expectedRevision:1}});assert.equal(stale.isError,true);assert.equal(JSON.parse(stale.content[0].text).error.code,'REVISION_CONFLICT');
  const summary=data(await client.callTool({name:'get_summary',arguments:{dateFrom:'2026-01-01',dateTo:'2026-01-31'}}));assert.deepEqual(summary,{dateFrom:'2026-01-01',dateTo:'2026-01-31',incomeCents:50000,netExpensesCents:2000,moneyLeftOverCents:48000,recordCount:2});
  const categories=data(await client.callTool({name:'list_categories',arguments:{includeArchived:true}}));assert.ok(categories.some(row=>row.id===salary.id));
});

test('budget MCP tools read/save/copy one selected calendar year with revision protection',async()=>{
  const empty=data(await client.callTool({name:'get_budget',arguments:{year:2026}}));assert.equal(empty.revision,null);
  const saved=data(await client.callTool({name:'save_budget',arguments:{year:2026,expectedRevision:null,overallLimitCents:0,categoryLimits:[]}}));assert.equal(saved.overallLimitCents,0);assert.equal(saved.overallRemainingCents,-2000);
  const copied=data(await client.callTool({name:'copy_budget',arguments:{year:2027,sourceYear:2026,overwrite:false,expectedRevision:null}}));assert.equal(copied.year,2027);assert.equal(copied.overallLimitCents,0);
  assert.deepEqual(data(await client.callTool({name:'get_budget',arguments:{year:2026}})),saved);
  const stale=await client.callTool({name:'save_budget',arguments:{year:2026,expectedRevision:null,overallLimitCents:1000,categoryLimits:[]}});assert.equal(stale.isError,true);
});
