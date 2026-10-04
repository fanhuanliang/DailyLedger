import { useEffect, useState, type FormEvent } from 'react';
import { PageHeading } from '../components/PageHeading';
import { useAccounts } from '../hooks/useAccounts';
import { useHouseholdToday } from '../hooks/useHouseholdToday';
import { parseOpeningBalanceInput, formatCentsAsDollars, centsToAmountInputValue } from '../lib/money';
import type { AccountSummary, AccountType } from '../types/domain';

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'checking', label: 'Checking' }, { value: 'savings', label: 'Savings' },
  { value: 'cash', label: 'Cash' }, { value: 'credit_card', label: 'Credit card' },
];
function balanceDisplay(type: AccountType, cents: number | 'not_available'): string {
  if (cents === 'not_available') return 'Not available';
  if (type !== 'credit_card') return formatCentsAsDollars(cents);
  return cents < 0 ? `${formatCentsAsDollars(-cents)} owed` : `${formatCentsAsDollars(cents)} card credit`;
}
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Could not save this change.'; }

export function AccountsPage() {
  const { accounts, loading, error, createAccount, updateAccount, archiveAccount } = useAccounts();
  const today = useHouseholdToday();
  const [editing, setEditing] = useState<AccountSummary | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [openingDate, setOpeningDate] = useState(today);
  const [dateTouched, setDateTouched] = useState(false);
  const [balanceInput, setBalanceInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!dateTouched && !editing) setOpeningDate(today); }, [today, dateTouched, editing]);

  function resetForm() {
    setEditing(null); setName(''); setType('checking'); setBalanceInput('');
    setDateTouched(false); setOpeningDate(today); setFormError(null);
  }
  function startEdit(account: AccountSummary) {
    setEditing(account); setName(account.name); setType(account.type); setOpeningDate(account.opening_date); setDateTouched(true);
    const entered = account.type === 'credit_card' ? -account.opening_balance_cents : account.opening_balance_cents;
    setBalanceInput(`${entered < 0 ? '-' : ''}${centsToAmountInputValue(entered)}`); setFormError(null);
  }
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setFormError(null);
    try {
      const enteredCents = parseOpeningBalanceInput(balanceInput);
      const openingBalanceCents = type === 'credit_card' ? -enteredCents : enteredCents;
      if (editing && !window.confirm('Editing the opening balance or date recalculates account balances. Existing transaction amounts stay unchanged. Continue?')) return;
      setBusy(true);
      const input = { name, openingDate, openingBalanceCents };
      if (editing) await updateAccount(editing.id, input, editing.revision);
      else await createAccount({ ...input, type });
      resetForm();
    } catch (err) { setFormError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  async function handleArchive(account: AccountSummary) {
    if (busy || !window.confirm('Archiving this account hides it from new entries; it cannot receive new entries but stays visible in your history. Continue?')) return;
    setBusy(true); setFormError(null);
    try { await archiveAccount(account.id, account.revision); }
    catch (err) { setFormError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeading title="Accounts" tagline="Your household, together." />
    <form className="panel" onSubmit={handleSubmit} aria-label={editing ? 'Edit an account' : 'Add an account'}>
      <h2>{editing ? 'Edit an account' : 'Add an account'}</h2>
      <div><label htmlFor="account-name">Account name</label><input id="account-name" value={name} onChange={(event) => setName(event.target.value)} required /></div>
      <div><label htmlFor="account-type">Account type</label><select id="account-type" disabled={Boolean(editing)} value={type} onChange={(event) => setType(event.target.value as AccountType)}>{ACCOUNT_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
      <div><label htmlFor="account-opening-date">Opening date</label><input id="account-opening-date" type="date" value={openingDate} onChange={(event) => { setDateTouched(true); setOpeningDate(event.target.value); }} required /></div>
      <div><label htmlFor="account-balance">{type === 'credit_card' ? 'Amount owed' : 'Starting balance'}</label><input id="account-balance" inputMode="decimal" placeholder="0.00" value={balanceInput} onChange={(event) => setBalanceInput(event.target.value)} required />
        <p className="muted">{type === 'credit_card' ? 'Enter zero if paid off. Use a negative amount for card credit.' : 'Zero and negative starting balances are allowed.'}</p>
      </div>
      {formError && <p role="alert">{formError}</p>}
      <button type="submit" disabled={busy}>{editing ? 'Save account' : 'Add account'}</button>
      {editing && <button type="button" disabled={busy} onClick={resetForm}>Cancel edit</button>}
    </form>
    {loading && <p>Loading accounts…</p>}{error && <p role="alert">{error}</p>}
    {!loading && !error && accounts.length === 0 && <section className="panel empty-state"><h2>No accounts yet</h2><p className="muted">Add your first account above to start your ledger.</p></section>}
    {!loading && !error && accounts.length > 0 && <div className="table-scroll"><table>
      <caption className="muted">Current balances, through the household date shown for each account.</caption>
      <thead><tr><th>Name</th><th>Type</th><th>Opening date</th><th>Balance</th><th>As of</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{accounts.map((account) => <tr key={account.id}>
        <td>{account.name}</td><td>{ACCOUNT_TYPES.find((option) => option.value === account.type)?.label}</td><td>{account.opening_date}</td>
        <td>{account.balance_cents === undefined ? 'Not available' : balanceDisplay(account.type, account.balance_cents)}</td><td>{account.balance_as_of}</td>
        <td>{account.archived_at ? 'Archived' : 'Active'}</td><td>
          <button type="button" disabled={busy} onClick={() => startEdit(account)}>Edit</button>
          {!account.archived_at && <button type="button" disabled={busy} onClick={() => handleArchive(account)}>Archive</button>}
        </td></tr>)}</tbody>
    </table></div>}
  </>;
}
