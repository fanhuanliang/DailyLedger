import {useCallback,useEffect,useState} from 'react';
import {loadAllPages} from '../api/pagination';
import {apiPost,apiPatch} from '../api/client';
import {useAccounts} from '../hooks/useAccounts';
import {parseAmountInput,formatCentsAsDollars,centsToAmountInputValue} from '../lib/money';
interface Goal {id:string;name:string;targetCents:number;savingsAccountId:string;deadline:string|null;status:'active'|'completed'|'archived';revision:number;progressCents:number|null;percentage:number|null;surplusCents:number|null;asOfDate:string}
export function GoalsPage(){
 const {accounts,loading:accountsLoading,error:accountsError}=useAccounts();
 const [goals,setGoals]=useState<Goal[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
 const [editing,setEditing]=useState<Goal|null>(null),[name,setName]=useState(''),[target,setTarget]=useState(''),[accountId,setAccountId]=useState(''),[deadline,setDeadline]=useState(''),[includeArchived,setIncludeArchived]=useState(false);
 const reload=useCallback(async()=>{setLoading(true);try{setGoals(await loadAllPages<Goal>('/goals?includeArchived='+includeArchived));}finally{setLoading(false);}},[includeArchived]);
 useEffect(()=>{let active=true;setLoading(true);setError(null);loadAllPages<Goal>('/goals?includeArchived='+includeArchived).then(rows=>{if(active)setGoals(rows);}).catch(err=>{if(active)setError(err instanceof Error?err.message:'Could not load goals.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[includeArchived]);
 function reset(){setEditing(null);setName('');setTarget('');setAccountId('');setDeadline('');}
 async function save(event:React.FormEvent){event.preventDefault();if(busy)return;setError(null);setBusy(true);try{
  const body={name,targetCents:parseAmountInput(target),savingsAccountId:accountId,deadline:deadline||null};
  if(editing)await apiPatch('/goals/'+editing.id,{...body,expectedRevision:editing.revision});else await apiPost('/goals',body);
  reset();await reload();
 }catch(err){setError(err instanceof Error?err.message:'Could not save goal.');}finally{setBusy(false);}}
 async function status(goal:Goal,action:'complete'|'archive'){if(busy||!window.confirm(`${action==='complete'?'Complete':'Archive'} ${goal.name}? Financial records and account balances stay unchanged.`))return;setBusy(true);setError(null);try{await apiPost(`/goals/${goal.id}/${action}`,{expectedRevision:goal.revision});if(editing?.id===goal.id)reset();await reload();}catch(err){setError(err instanceof Error?err.message:'Could not update goal.');}finally{setBusy(false);}}
 const choices=accounts.filter(account=>account.type==='savings'&&(account.archived_at===null||account.id===editing?.savingsAccountId));
 return <section className="panel"><h2>Savings goals</h2><p>One active goal per savings account. Its existing balance contributes to the goal.</p><p>Goal changes leave financial records and account balances unchanged.</p>
 {(error||accountsError)&&<p role="alert">{error||accountsError}</p>}
 <form className="entry-form" onSubmit={save}>
 <label>Goal name<input required value={name} disabled={busy} onChange={event=>setName(event.target.value)}/></label>
 <label>Target amount<input required inputMode="decimal" value={target} disabled={busy} onChange={event=>setTarget(event.target.value)}/></label>
 <label>Savings account<select required value={accountId} disabled={busy||accountsLoading} onChange={event=>setAccountId(event.target.value)}><option value="">Choose savings account</option>{choices.map(account=><option key={account.id} value={account.id}>{account.name}{account.archived_at?' (archived)':''}</option>)}</select></label>
 <label>Deadline (optional)<input type="date" value={deadline} disabled={busy} onChange={event=>setDeadline(event.target.value)}/></label>
 <button disabled={busy||loading||accountsLoading||Boolean(accountsError)} type="submit">{editing?'Save goal':'Create goal'}</button>{editing&&<button disabled={busy} type="button" onClick={reset}>Cancel edit</button>}
 </form>
 <label className="checkbox-label"><input type="checkbox" checked={includeArchived} disabled={busy} onChange={event=>setIncludeArchived(event.target.checked)}/>Show archived goals</label>
 {loading?<p role="status">Loading goals…</p>:goals.length===0?<p>No goals yet. Link a savings account to start planning.</p>:goals.map(goal=><article className="panel" key={goal.id}><h3>{goal.name}</h3><p>{goal.status} · {accounts.find(account=>account.id===goal.savingsAccountId)?.name??'Savings account'}{goal.deadline?' · Due '+goal.deadline:''}</p><p>Target: {formatCentsAsDollars(goal.targetCents)}</p><p>Current progress ({goal.asOfDate}): {goal.progressCents===null?'Not available':formatCentsAsDollars(goal.progressCents)} · {goal.percentage===null?'Not available':`${Math.round(goal.percentage*100)/100}%`}</p><p>Surplus: {goal.surplusCents===null?'Not available':formatCentsAsDollars(goal.surplusCents)}</p><div className="actions"><button disabled={busy||accountsLoading} aria-label={'Edit '+goal.name} onClick={()=>{setEditing(goal);setName(goal.name);setTarget(centsToAmountInputValue(goal.targetCents));setAccountId(goal.savingsAccountId);setDeadline(goal.deadline??'');}}>Edit</button>{goal.status==='active'&&<button disabled={busy} aria-label={'Complete '+goal.name} onClick={()=>status(goal,'complete')}>Complete</button>}{goal.status!=='archived'&&<button disabled={busy} aria-label={'Archive '+goal.name} onClick={()=>status(goal,'archive')}>Archive</button>}</div></article>)}
 </section>;
}
