import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api/client';
import { useHouseholdToday } from '../hooks/useHouseholdToday';
import { formatCentsAsDollars } from '../lib/money';
import type { AccountSummary, AnnualBudget } from '../types/domain';

interface Totals { incomeCents: number; netExpensesCents: number; moneyLeftOverCents: number; recordCount: number }
interface Period { dateFrom: string; dateTo: string }
interface Insights {
  overview: Totals & Period;
  categories: { totalNetExpensesCents: number; rows: { categoryId: string; name: string; netExpensesCents: number; percentage: number | null; recordCount: number }[] };
  trends: { rows: (Totals & { month: string })[] };
  balances: { asOfDate: string; rows: AccountSummary[] };
  budgets: AnnualBudget[];
  goalsAsOfDate: string;
  goals: { id: string; name: string; status: string; targetCents: number; progressCents: number | null; percentage: number | null; surplusCents: number | null }[];
  remindersAsOfDate: string;
  reminders: { id: string; name: string; dueDate: string; amountCents: number; type: string }[];
}
interface Comparison { mode: string; current: Totals & Period; previous: Totals & Period; currentYearIncomplete: boolean }
function monthPeriod(month: string): Period {
  const date = new Date(0); date.setUTCFullYear(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0);
  return { dateFrom: month + '-01', dateTo: month + '-' + String(date.getUTCDate()).padStart(2, '0') };
}
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) return false;
  const date = new Date(0); date.setUTCFullYear(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10))); date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10) === value;
}
function BarChart({ title, rows }: { title: string; rows: { label: string; cents: number }[] }) {
  const maximum = Math.max(1, ...rows.map(row => Math.abs(row.cents)));
  return <figure className="report-chart"><figcaption>{title}</figcaption>{rows.length === 0 ? <p>No records in this period.</p> : rows.map((row, index) => <div className="chart-row" key={index}>
    <span>{row.label}</span><svg viewBox="0 0 240 22" role="img" aria-label={`${row.label}: ${formatCentsAsDollars(row.cents)}`}>
      <line x1="120" y1="0" x2="120" y2="22" stroke="#839384" />
      <rect x={row.cents < 0 ? 120 - Math.abs(row.cents) / maximum * 116 : 120} y="3" width={Math.abs(row.cents) / maximum * 116} height="16" fill={row.cents < 0 ? '#a13427' : '#245341'} />
    </svg><span>{formatCentsAsDollars(row.cents)}</span></div>)}<p className="muted">Bars left of zero show negative values, including net refunds.</p></figure>;
}
export function InsightsView({ detailed = false }: { detailed?: boolean }) {
  const today = useHouseholdToday();
  const [kind, setKind] = useState('month'), [month, setMonth] = useState(today.slice(0, 7)), [year, setYear] = useState(today.slice(0, 4));
  const [custom, setCustom] = useState<Period>(() => monthPeriod(today.slice(0, 7)));
  const [period, setPeriod] = useState<Period>(() => monthPeriod(today.slice(0, 7))), [touched, setTouched] = useState(false);
  const [data, setData] = useState<Insights | null>(null), [error, setError] = useState(''), [inputError, setInputError] = useState(''), [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0), [comparisonMode, setComparisonMode] = useState('ytd'), [comparison, setComparison] = useState<Comparison | null>(null), [comparisonError, setComparisonError] = useState('');
  useEffect(() => { if (!touched) { setMonth(today.slice(0, 7)); setYear(today.slice(0, 4)); setCustom(monthPeriod(today.slice(0, 7))); setPeriod(monthPeriod(today.slice(0, 7))); } }, [today, touched]);
  const query = new URLSearchParams({ dateFrom: period.dateFrom, dateTo: period.dateTo }).toString();
  useEffect(() => {
    let cancelled = false; setLoading(true); setError(''); setData(null);
    apiGet<Insights>('/reports/insights?' + query).then(result => {
      if (!result.data?.overview || !result.data.categories || !result.data.trends || !result.data.balances) throw new Error('Report response is incomplete.');
      if (!cancelled) setData(result.data);
    }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load reports'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [query, reload]);
  useEffect(() => {
    if (!detailed) return;
    let cancelled = false; setComparison(null); setComparisonError('');
    const suffix = comparisonMode === 'calendar' ? '?mode=calendar&year=' + period.dateFrom.slice(0, 4) : comparisonMode === 'period' ? '?' + query : '';
    apiGet<Comparison>('/reports/year-comparison' + suffix).then(result => { if (!cancelled) setComparison(result.data); }).catch(reason => { if (!cancelled) setComparisonError(reason instanceof Error ? reason.message : 'Unable to compare years'); });
    return () => { cancelled = true; };
  }, [detailed, comparisonMode, query, period.dateFrom, reload]);
  function apply(event: FormEvent) {
    event.preventDefault(); setInputError('');
    let next: Period;
    if (kind === 'month') { if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 1) { setInputError('Choose a valid month.'); return; } next = monthPeriod(month); }
    else if (kind === 'year') { if (!/^\d{4}$/.test(year) || Number(year) < 1) { setInputError('Choose a four-digit calendar year.'); return; } next = { dateFrom: year + '-01-01', dateTo: year + '-12-31' }; }
    else next = custom;
    if (!validDate(next.dateFrom) || !validDate(next.dateTo) || next.dateFrom > next.dateTo) { setInputError('Choose valid dates with the start on or before the end.'); return; }
    setTouched(true); setPeriod(next); setReload(value => value + 1);
  }
  const money = (value: number | null) => value === null ? 'Not available' : formatCentsAsDollars(value);
  return <>
    <form className="panel" onSubmit={apply}>
      <div><label htmlFor="insight-period">Period</label><select id="insight-period" value={kind} onChange={event => { setTouched(true); setKind(event.target.value); }}><option value="month">Month</option><option value="year">Calendar year</option><option value="custom">Custom dates</option></select></div>
      {kind === 'month' && <div><label htmlFor="insight-month">Month</label><input id="insight-month" type="month" value={month} onChange={event => { setTouched(true); setMonth(event.target.value); }} /></div>}
      {kind === 'year' && <div><label htmlFor="insight-year">Calendar year</label><input id="insight-year" inputMode="numeric" maxLength={4} value={year} onChange={event => setYear(event.target.value)} /></div>}
      {kind === 'custom' && <><div><label htmlFor="insight-from">Start date</label><input id="insight-from" type="date" value={custom.dateFrom} onChange={event => setCustom({ ...custom, dateFrom: event.target.value })} /></div><div><label htmlFor="insight-to">End date</label><input id="insight-to" type="date" value={custom.dateTo} onChange={event => setCustom({ ...custom, dateTo: event.target.value })} /></div></>}
      <button type="submit">Apply period</button>{inputError && <p role="alert">{inputError}</p>}
    </form>
    <p>{period.dateFrom} through {period.dateTo}{period.dateTo > today ? ' · Period includes dates after today' : ''}</p>
    <button onClick={() => setReload(value => value + 1)} disabled={loading}>Refresh reports</button>{detailed && <a className="secondary-button" href={'/api/v1/exports/transactions.csv?' + query}>Export records CSV</a>}
    {loading && <p role="status">Loading reports…</p>}{error && <p role="alert">{error}</p>}
    {data && <>
      <section className="summary-grid" aria-label="Period totals">{[['Income', data.overview.incomeCents], ['Net spending', data.overview.netExpensesCents], ['Money left over', data.overview.moneyLeftOverCents]].map(([label, cents]) => <div className="panel" key={label}><p>{label}</p><div className="amount">{money(cents as number)}</div></div>)}</section>
      {data.overview.recordCount === 0 && <p>No records in this period. <Link to="/records?new=1">Add a transaction</Link>.</p>}
      <section className="panel"><h2>Spending by category</h2><BarChart title="Net spending" rows={data.categories.rows.map(row => ({ label: row.name, cents: row.netExpensesCents }))} /></section>
      <section className="panel"><h2>Monthly trends</h2><BarChart title="Income" rows={data.trends.rows.map(row => ({ label: row.month, cents: row.incomeCents }))} /><BarChart title="Net spending" rows={data.trends.rows.map(row => ({ label: row.month, cents: row.netExpensesCents }))} /></section>
      {detailed && <><section className="panel"><h2>Category detail</h2><div className="table-scroll"><table><thead><tr><th>Category</th><th>Net spending</th><th>Share</th><th>Records</th></tr></thead><tbody>{data.categories.rows.map(row => <tr key={row.categoryId}><td>{row.name}</td><td>{money(row.netExpensesCents)}</td><td>{row.percentage === null ? 'Unavailable' : row.percentage.toFixed(1) + '%'}</td><td>{row.recordCount}</td></tr>)}</tbody></table></div></section>
      <section className="panel"><h2>Monthly detail</h2><div className="table-scroll"><table><thead><tr><th>Month</th><th>Income</th><th>Net spending</th><th>Money left over</th></tr></thead><tbody>{data.trends.rows.map(row => <tr key={row.month}><td>{row.month}</td><td>{money(row.incomeCents)}</td><td>{money(row.netExpensesCents)}</td><td>{money(row.moneyLeftOverCents)}</td></tr>)}</tbody></table></div></section></>}
      <section className="panel"><h2>Account balances</h2><p className="muted">As of {data.balances.asOfDate}. Balances include opening balances and transfers, separately from period spending.</p><div className="table-scroll"><table><thead><tr><th>Account</th><th>Balance</th><th>Status</th></tr></thead><tbody>{data.balances.rows.map(row => <tr key={row.id}><td>{row.name}</td><td>{row.balance_cents === 'not_available' ? 'Not available' : row.type === 'credit_card' ? <>{row.balance_cents < 0 ? 'Amount owed' : 'Card credit'}: {money(Math.abs(row.balance_cents))}</> : money(row.balance_cents)}</td><td>{row.archived_at ? 'Archived' : 'Active'}</td></tr>)}</tbody></table></div></section>
      <section className="panel"><h2>Annual budgets</h2><p className="muted">Each budget covers its full calendar year, independently of the selected period.</p>{data.budgets.map(budget => <div key={budget.year}><h3>{budget.year}</h3><p>Overall limit: {budget.overallLimitCents === null ? 'Not set' : money(budget.overallLimitCents)} · Remaining: {budget.overallRemainingCents === null ? 'Not set' : money(budget.overallRemainingCents)}</p>{detailed && <div className="table-scroll"><table><thead><tr><th>Category</th><th>Limit</th><th>Annual net spending</th><th>Remaining</th></tr></thead><tbody>{budget.categoryRows.map(row => <tr key={row.categoryId}><td>{row.name}</td><td>{row.limitCents === null ? 'Not set' : money(row.limitCents)}</td><td>{money(row.netSpendingCents)}</td><td>{row.remainingCents === null ? 'Not set' : money(row.remainingCents)}</td></tr>)}</tbody></table></div>}</div>)}</section>
      <section className="panel"><h2>Current goals</h2><p className="muted">Current progress as of {data.goalsAsOfDate}; historical progress is unavailable.</p>{data.goals.length === 0 ? <p>No goals yet.</p> : data.goals.map(goal => <p key={goal.id}>{goal.name}: {money(goal.progressCents)} of {money(goal.targetCents)} · {goal.percentage === null ? 'Not available' : goal.percentage.toFixed(1) + '%'} · {goal.status}{goal.surplusCents ? ` · Surplus ${money(goal.surplusCents)}` : ''}</p>)}</section>
      <section className="panel"><h2>Reminders</h2><p className="muted">Due, overdue and next 30 days as of {data.remindersAsOfDate}. <Link to="/reminders">Review reminders</Link>.</p>{data.reminders.length === 0 ? <p>No reminders due.</p> : data.reminders.map(row => <p key={row.id}>{row.name} · {row.dueDate} · {row.type} · {money(row.amountCents)}</p>)}</section>
    </>}
    {detailed && <section className="panel"><h2>Year comparison</h2><label htmlFor="comparison-mode">Compare</label><select id="comparison-mode" value={comparisonMode} onChange={event => setComparisonMode(event.target.value)}><option value="ytd">Current year to date</option><option value="period">Selected period against previous year</option><option value="calendar">Full selected calendar year</option></select>
      {comparisonError && <p role="alert">{comparisonError}</p>}{comparison && <><p>{comparison.currentYearIncomplete ? 'Current calendar year is partial.' : 'Comparison periods shown below.'}</p><div className="table-scroll"><table><thead><tr><th>Period</th><th>Income</th><th>Net spending</th><th>Money left over</th></tr></thead><tbody>{[comparison.current, comparison.previous].map((row, index) => <tr key={index}><td>{row.dateFrom} through {row.dateTo}</td><td>{money(row.incomeCents)}</td><td>{money(row.netExpensesCents)}</td><td>{money(row.moneyLeftOverCents)}</td></tr>)}</tbody></table></div></>}
    </section>}
  </>;
}
