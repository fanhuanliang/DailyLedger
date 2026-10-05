import {useEffect,useState,type FormEvent} from 'react';
import {PageHeading} from '../components/PageHeading';
import {useHouseholdToday} from '../hooks/useHouseholdToday';
import {useBudget} from '../hooks/useBudget';
import {apiPut,apiPost} from '../api/client';
import {parseOpeningBalanceInput,formatCentsAsDollars,centsToAmountInputValue} from '../lib/money';
import type {AnnualBudget} from '../types/domain';
function optionalLimit(text:string):number|null {
  if(!text.trim())return null;
  const cents=parseOpeningBalanceInput(text);
  if(cents<0)throw new Error('Budget limits must be zero or greater.');
  return cents;
}
function display(value:number|null):string {return value===null?'Not set':formatCentsAsDollars(value);}
export function BudgetsPage() {
  const today=useHouseholdToday();
  const [year,setYear]=useState(today.slice(0,4));const [yearTouched,setYearTouched]=useState(false);
  const {budget,setBudget,loading,error}=useBudget(year);
  const [overall,setOverall]=useState('');const [limits,setLimits]=useState<Record<string,string>>({});
  const [overwrite,setOverwrite]=useState(false);const [busy,setBusy]=useState(false);const [formError,setFormError]=useState<string|null>(null);
  useEffect(()=>{if(!yearTouched)setYear(today.slice(0,4));},[today,yearTouched]);
  useEffect(()=>{
    setOverall(budget?.overallLimitCents===null||!budget?'':centsToAmountInputValue(budget.overallLimitCents));
    setLimits(Object.fromEntries((budget?.categoryRows??[]).map(row=>[row.categoryId,row.limitCents===null?'':centsToAmountInputValue(row.limitCents)])));
    setOverwrite(false);setFormError(null);
  },[budget]);
  async function save(event:FormEvent) {
    event.preventDefault();if(busy||!budget)return;setFormError(null);
    try {
      const overallLimitCents=optionalLimit(overall);
      const categoryLimits=budget.categoryRows.flatMap(row=>{const limitCents=optionalLimit(limits[row.categoryId]??'');return limitCents===null?[]:[{categoryId:row.categoryId,limitCents}];});
      setBusy(true);
      const result=await apiPut<AnnualBudget>('/budgets/'+year,{expectedRevision:budget.revision,overallLimitCents,categoryLimits});
      setBudget(result.data);
    }catch(error){setFormError(error instanceof Error?error.message:'Could not save the budget.');}
    finally{setBusy(false);}
  }
  async function copy() {
    if(busy||!budget)return;setFormError(null);
    if(!window.confirm(`Copy ${Number(year)-1} budget into ${year}? ${overwrite?'Existing target limits will be overwritten.':'Existing limits are protected.'}`))return;
    setBusy(true);
    try{setBudget((await apiPost<AnnualBudget>('/budgets/'+year+'/copy',{sourceYear:Number(year)-1,overwrite,expectedRevision:budget.revision})).data);}
    catch(error){setFormError(error instanceof Error?error.message:'Could not copy the budget.');}
    finally{setBusy(false);}
  }
  return <>
    <PageHeading title="Budgets" tagline="Plan spending for one calendar year."/>
    <section className="panel"><label htmlFor="budget-year">Calendar year</label><input id="budget-year" type="number" min="1" max="9999" value={year} disabled={busy} onChange={event=>{setYearTouched(true);setYear(event.target.value);}}/><p className="muted">Overall and category limits are independent. Blank means Not set; zero is a valid limit. Account balances do not reset with budgets.</p></section>
    {loading&&<p>Loading budget…</p>}{error&&<p role="alert">{error}</p>}
    {budget&&!loading&&<form className="panel" aria-label="Annual budget" onSubmit={save}>
      <h2 className="wide-field">Calendar year {budget.year}</h2>
      <div><label htmlFor="budget-overall">Overall limit</label><input id="budget-overall" inputMode="decimal" placeholder="Not set" value={overall} disabled={busy} onChange={event=>setOverall(event.target.value)}/></div>
      <div><p>Net spending: {formatCentsAsDollars(budget.netSpendingCents)}</p><p>Remaining: {display(budget.overallRemainingCents)}</p></div>
      <div className="table-scroll wide-field"><table><caption>Expense category budgets</caption><thead><tr><th>Category</th><th>Annual limit</th><th>Net spending</th><th>Remaining</th></tr></thead><tbody>{budget.categoryRows.map(row=><tr key={row.categoryId}><td>{row.name}{row.archivedAt?' (archived)':''}</td><td><label className="sr-only" htmlFor={'budget-'+row.categoryId}>{row.name} limit</label><input id={'budget-'+row.categoryId} inputMode="decimal" placeholder="Not set" disabled={busy} value={limits[row.categoryId]??''} onChange={event=>setLimits(previous=>({...previous,[row.categoryId]:event.target.value}))}/></td><td>{formatCentsAsDollars(row.netSpendingCents)}</td><td>{display(row.remainingCents)}</td></tr>)}</tbody></table></div>
      {formError&&<p className="wide-field" role="alert">{formError}</p>}
      <button type="submit" disabled={busy}>Save budget</button>
      <div className="wide-field"><label><input type="checkbox" checked={overwrite} disabled={busy} onChange={event=>setOverwrite(event.target.checked)}/>Overwrite existing target limits</label><button type="button" disabled={busy||Number(year)<=1} onClick={copy}>Copy previous year</button></div>
    </form>}
  </>;
}
