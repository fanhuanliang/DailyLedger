import {useEffect,useState} from 'react';
import {apiGet} from '../api/client';
import type {AnnualBudget} from '../types/domain';
export function useBudget(year:string) {
  const [budget,setBudget]=useState<AnnualBudget|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{
    let active=true;setBudget(null);setError(null);
    if(!/^\d{4}$/.test(year)||Number(year)<1){setLoading(false);setError('Enter a four-digit calendar year.');return;}
    setLoading(true);
    apiGet<AnnualBudget>('/budgets/'+year).then(result=>{if(active)setBudget(result.data);}).catch(error=>{if(active)setError(error instanceof Error?error.message:'Could not load the budget.');}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[year]);
  return {budget,setBudget,loading,error};
}
