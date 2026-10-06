import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PageHeading } from '../components/PageHeading';
import { useHouseholdToday } from '../hooks/useHouseholdToday';
import { useAccounts } from '../hooks/useAccounts';
import { useCategories } from '../hooks/useCategories';
import { loadAllPages } from '../api/pagination';
import { apiPost, apiPatch } from '../api/client';
import { parseAmountInput, formatCentsAsDollars, centsToAmountInputValue } from '../lib/money';
interface Version {
    id: string;
    effectiveDate: string;
    amountCents: number;
    type: 'income' | 'expense';
    accountId: string;
    categoryId: string;
    description: string;
    cadence: 'weekly' | 'biweekly' | 'monthly' | 'yearly';
    anchorDate: string;
    endDate: string | null;
}
interface Template {
    id: string;
    name: string;
    status: 'active' | 'ended';
    revision: number;
    versions: Version[];
}
interface Reminder {
    id: string;
    templateId: string;
    name: string;
    dueDate: string;
    amountCents: number;
    type: 'income' | 'expense';
    accountId: string;
    categoryId: string;
    description: string;
    revision: number;
    status: 'unconfirmed' | 'confirmed' | 'skipped';
    transaction: {
        id: string;
        amount_cents: number; description: string;
        date: string;
    } | null;
}
interface Draft {
    name: string;
    amount: string;
    type: Version['type'];
    accountId: string;
    categoryId: string;
    description: string;
    cadence: Version['cadence'];
    anchorDate: string;
    effectiveDate: string;
    endDate: string;
}
interface Entry {
    date: string;
    amount: string;
    description: string;
    accountId: string;
    categoryId: string;
    notes: string;
}
function emptyDraft(today: string): Draft {
    return { name: '', amount: '', type: 'expense', accountId: '', categoryId: '', description: '', cadence: 'monthly', anchorDate: today, effectiveDate: today, endDate: '' };
}
export function RemindersPage() {
    const today = useHouseholdToday(), { accounts, loading: accountsLoading, error: accountsError } = useAccounts(), { categories, loading: categoriesLoading, error: categoriesError } = useCategories();
    const [templates, setTemplates] = useState<Template[]>([]), [reminders, setReminders] = useState<Reminder[]>([]), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
    const [draft, setDraft] = useState(() => emptyDraft(today)), [touched, setTouched] = useState(false), [editing, setEditing] = useState<Template | null>(null), [method, setMethod] = useState('fixed'), [percentage, setPercentage] = useState(''), [preview, setPreview] = useState<{
        snapshot: string;
        amountCents: number;
        effectiveDate: string;
    } | null>(null);
    const [confirming, setConfirming] = useState<Reminder | null>(null), [entry, setEntry] = useState<Entry | null>(null), [history, setHistory] = useState(false), [dateFrom, setDateFrom] = useState(''), [dateTo, setDateTo] = useState('');
    const reminderPath = '/reminders?' + new URLSearchParams({ status: history ? 'all' : 'unconfirmed', ...(dateFrom ? { dateFrom } : {}), ...(dateTo ? { dateTo } : {}) }).toString();
    const reload = useCallback(async () => {
        setLoading(true);
        try {
            const [schedules, occurrences] = await Promise.all([loadAllPages<Template>('/recurring'), loadAllPages<Reminder>(reminderPath)]);
            setTemplates(schedules);
            setReminders(occurrences);
        }
        finally {
            setLoading(false);
        }
    }, [reminderPath]);
    useEffect(() => {
        let active = true;
        setLoading(true);
        setError(null);
        Promise.all([loadAllPages<Template>('/recurring'), loadAllPages<Reminder>(reminderPath)]).then(([schedules, occurrences]) => {
            if (active) {
                setTemplates(schedules);
                setReminders(occurrences);
            }
        }).catch(err => {
            if (active) {
                setError(err instanceof Error ? err.message : 'Could not load reminders.');
            }
        }).finally(() => {
            if (active) {
                setLoading(false);
            }
        });
        return () => {
            active = false;
        };
    }, [reminderPath]);
    useEffect(() => {
        if (!touched && !editing) {
            setDraft(emptyDraft(today));
        }
    }, [today, touched, editing]);
    function change<K extends keyof Draft>(key: K, value: Draft[K]) {
        setTouched(true);
        setPreview(null);
        setDraft(current => ({ ...current, [key]: value, ...(key === 'type' ? { categoryId: '' } : {}) }));
    }
    function reset() {
        setEditing(null);
        setDraft(emptyDraft(today));
        setMethod('fixed');
        setPercentage('');
        setPreview(null);
        setTouched(false);
    }
    function versionInput() {
        return { effectiveDate: draft.effectiveDate, ...(editing && method === 'percentage' ? { percentageChange: percentage } : { amountCents: parseAmountInput(draft.amount) }), type: draft.type, accountId: draft.accountId, categoryId: draft.categoryId, description: draft.description, cadence: draft.cadence, anchorDate: draft.anchorDate, endDate: draft.endDate || null, ...(editing ? { expectedRevision: editing.revision } : {}) };
    }
    async function perform(action: () => Promise<void>) {
        if (busy) {
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await action();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save this change.');
        }
        finally {
            setBusy(false);
        }
    }
    async function previewChange() {
        if (!editing) {
            return;
        }
        await perform(async () => {
            const input = versionInput();
            const result = await apiPost<{
                amountCents: number;
                effectiveDate: string;
            }>(`/recurring/${editing.id}/version-preview`, input);
            setPreview({ snapshot: JSON.stringify(input), ...result.data });
        });
    }
    async function saveSchedule(event: FormEvent) {
        event.preventDefault();
        await perform(async () => {
            const input = versionInput();
            if (editing) {
                if (!preview || preview.snapshot !== JSON.stringify(input)) {
                    throw new Error('Preview the current amount and effective date before saving.');
                }
                await apiPost(`/recurring/${editing.id}/versions`, input);
            }
            else {
                await apiPost('/recurring', { name: draft.name, ...input });
            }
            reset();
            await reload();
        });
    }
    function edit(template: Template) {
        const version = template.versions.at(-1)!;
        setEditing(template);
        setDraft({ name: template.name, amount: centsToAmountInputValue(version.amountCents), type: version.type, accountId: version.accountId, categoryId: version.categoryId, description: version.description, cadence: version.cadence, anchorDate: version.anchorDate, effectiveDate: today, endDate: version.endDate ?? '' });
        setMethod('fixed');
        setPercentage('');
        setPreview(null);
        setTouched(true);
    }
    function openConfirmation(reminder: Reminder) {
        setConfirming(reminder);
        setEntry({ date: reminder.dueDate, amount: centsToAmountInputValue(reminder.amountCents), description: reminder.description, accountId: reminder.accountId, categoryId: reminder.categoryId, notes: '' });
    }
    async function saveConfirmation(event: FormEvent) {
        event.preventDefault();
        if (!confirming || !entry) {
            return;
        }
        await perform(async () => {
            await apiPost(`/reminders/${confirming.id}/confirm`, { expectedRevision: confirming.revision, date: entry.date, amountCents: parseAmountInput(entry.amount), description: entry.description, accountId: entry.accountId, categoryId: entry.categoryId, notes: entry.notes || null });
            setConfirming(null);
            setEntry(null);
            await reload();
        });
    }
    async function skip(reminder: Reminder) {
        if (!window.confirm(`Skip ${reminder.name} on ${reminder.dueDate}? No transaction will be created.`)) {
            return;
        }
        await perform(async () => {
            await apiPost(`/reminders/${reminder.id}/skip`, { expectedRevision: reminder.revision });
            await reload();
        });
    }
    async function end(template: Template) {
        if (!window.confirm(`End ${template.name} today? Existing records and confirmed/skipped reminders are preserved.`)) {
            return;
        }
        await perform(async () => {
            await apiPatch('/recurring/' + template.id, { expectedRevision: template.revision, status: 'ended' });
            if (editing?.id === template.id) {
                reset();
            }
            await reload();
        });
    }
    async function rename(template: Template) {
        const name = window.prompt('Schedule name', template.name);
        if (name === null) {
            return;
        }
        await perform(async () => {
            await apiPatch('/recurring/' + template.id, { expectedRevision: template.revision, name });
            await reload();
        });
    }
    const blocked = busy || loading || accountsLoading || categoriesLoading || Boolean(accountsError || categoriesError);
    const activeAccounts = accounts.filter(account => account.archived_at === null), activeCategories = categories.filter(category => category.archived_at === null);
    return <><PageHeading title="Reminders" tagline="Confirm income and bills when they happen."/>
 <p>Due and overdue reminders, plus the next 30 days. Nothing is recorded automatically.</p>
 {(error || accountsError || categoriesError) && <p role="alert">{error || accountsError || categoriesError}</p>}
 <button disabled={busy} onClick={() => perform(async () => {
        reset();
        setConfirming(null);
        setEntry(null);
        await reload();
    })}>Reload reminders</button>
 <form className="panel" onSubmit={saveSchedule}><h2 className="wide-field">{editing ? 'Change schedule' : 'New recurring schedule'}</h2>
 <label>Schedule name<input required disabled={busy || Boolean(editing)} value={draft.name} onChange={event => change('name', event.target.value)}/></label>
 <label>Schedule type<select disabled={busy} value={draft.type} onChange={event => change('type', event.target.value as Draft['type'])}><option value="expense">Expense</option><option value="income">Income</option></select></label>
 {editing && <label>Amount change method<select disabled={busy} value={method} onChange={event => {
        setMethod(event.target.value);
        setPreview(null);
    }}><option value="fixed">Fixed amount</option><option value="percentage">Percentage change</option></select></label>}
 {editing && method === 'percentage' ? <label>Percentage change<input required disabled={busy} inputMode="decimal" value={percentage} onChange={event => {
        setPercentage(event.target.value);
        setPreview(null);
    }}/></label> : <label>Scheduled amount<input required disabled={busy} inputMode="decimal" value={draft.amount} onChange={event => change('amount', event.target.value)}/></label>}
 <label>Schedule account<select required disabled={busy} value={draft.accountId} onChange={event => change('accountId', event.target.value)}><option value="">Choose account</option>{activeAccounts.map(account => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label>
 <label>Schedule category<select required disabled={busy} value={draft.categoryId} onChange={event => change('categoryId', event.target.value)}><option value="">Choose category</option>{activeCategories.filter(category => category.kind === draft.type).map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
 <label>Schedule description<input required disabled={busy} value={draft.description} onChange={event => change('description', event.target.value)}/></label>
 <label>Cadence<select disabled={busy} value={draft.cadence} onChange={event => change('cadence', event.target.value as Draft['cadence'])}><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
 <label>Anchor date<input required disabled={busy} type="date" value={draft.anchorDate} onChange={event => change('anchorDate', event.target.value)}/></label>
 <label>Effective date<input required disabled={busy} type="date" value={draft.effectiveDate} onChange={event => change('effectiveDate', event.target.value)}/></label>
 <label>End date (optional)<input disabled={busy} type="date" value={draft.endDate} onChange={event => change('endDate', event.target.value)}/></label>
 {editing && <p className="wide-field">Changes preserve recorded transactions and confirmed/skipped reminders. Only unconfirmed future dates are regenerated.</p>}
 {editing && <button type="button" disabled={blocked} onClick={previewChange}>Preview change</button>}
 {preview && <p className="wide-field" role="status">Result: {formatCentsAsDollars(preview.amountCents)} effective {preview.effectiveDate}</p>}
 <button disabled={blocked || (Boolean(editing) && !preview)} type="submit">{editing ? 'Save version' : 'Create schedule'}</button>{editing && <button type="button" disabled={busy} onClick={reset}>Cancel change</button>}
 </form>
 {confirming && entry && <form className="panel" onSubmit={saveConfirmation}><h2 className="wide-field">Confirm {confirming.name}</h2><p className="wide-field">Saving creates one {confirming.type} record and changes ledger totals. One-time edits leave the schedule unchanged.</p><label>Confirmed date<input required disabled={busy} type="date" value={entry.date} onChange={event => setEntry({ ...entry, date: event.target.value })}/></label><label>Confirmed amount<input required disabled={busy} inputMode="decimal" value={entry.amount} onChange={event => setEntry({ ...entry, amount: event.target.value })}/></label><label>Confirmed description<input required disabled={busy} value={entry.description} onChange={event => setEntry({ ...entry, description: event.target.value })}/></label><label>Confirmed account<select required disabled={busy} value={entry.accountId} onChange={event => setEntry({ ...entry, accountId: event.target.value })}><option value="">Choose active account</option>{activeAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label>Confirmed category<select required disabled={busy} value={entry.categoryId} onChange={event => setEntry({ ...entry, categoryId: event.target.value })}><option value="">Choose active category</option>{activeCategories.filter(category => category.kind === confirming.type).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Confirmed notes<input disabled={busy} value={entry.notes} onChange={event => setEntry({ ...entry, notes: event.target.value })}/></label><button disabled={blocked} type="submit">Save confirmed entry</button><button type="button" disabled={busy} onClick={() => {
        setConfirming(null);
        setEntry(null);
    }}>Cancel confirmation</button></form>}
 <section className="panel"><h2>Occurrences</h2><label><input type="checkbox" checked={history} disabled={busy} onChange={event => setHistory(event.target.checked)}/>Show confirmed and skipped history</label><div className="filters"><label>Reminder from<input type="date" disabled={busy} value={dateFrom} onChange={event => setDateFrom(event.target.value)}/></label><label>Reminder through<input type="date" disabled={busy} value={dateTo} onChange={event => setDateTo(event.target.value)}/></label></div>
 {loading ? <p role="status">Loading reminders…</p> : reminders.length === 0 ? <p>No reminders in this range. Create a schedule to plan income or bills.</p> : reminders.map(reminder => <article key={reminder.id} className="panel"><h3>{reminder.name}</h3><p>{reminder.dueDate} · {reminder.status === 'unconfirmed' ? (reminder.dueDate < today ? 'Overdue' : reminder.dueDate === today ? 'Due today' : 'Upcoming') : reminder.status} · {formatCentsAsDollars(reminder.amountCents)}</p>{reminder.status === 'unconfirmed' && <div className="button-row"><button disabled={blocked} aria-label={`Confirm ${reminder.name} ${reminder.dueDate}`} onClick={() => openConfirmation(reminder)}>Confirm</button><button disabled={busy} aria-label={`Skip ${reminder.name} ${reminder.dueDate}`} onClick={() => skip(reminder)}>Skip</button></div>}{reminder.transaction && <p>Linked record: {reminder.transaction.date} · {formatCentsAsDollars(reminder.transaction.amount_cents)} · {reminder.transaction.description}</p>}</article>)}
 </section>
 <section className="panel"><h2>Schedules and version history</h2>{templates.length === 0 ? <p>No schedules yet.</p> : templates.map(template => <article className="panel" key={template.id}><h3>{template.name}</h3><p>{template.status}</p><ul>{template.versions.map(version => <li key={version.id}>Effective {version.effectiveDate}: {formatCentsAsDollars(version.amountCents)} · {version.cadence} · Anchor {version.anchorDate}{version.endDate ? ' · Ends ' + version.endDate : ''}</li>)}</ul><div className="button-row"><button disabled={busy} aria-label={'Rename ' + template.name} onClick={() => rename(template)}>Rename</button>{template.status === 'active' && <><button disabled={blocked} aria-label={'Change ' + template.name} onClick={() => edit(template)}>Change</button><button disabled={busy} aria-label={'End ' + template.name} onClick={() => end(template)}>End schedule</button></>}</div></article>)}</section>
 </>;
}
