import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { PageHeading } from '../components/PageHeading';
import { useAccounts } from '../hooks/useAccounts';
import { useCategories } from '../hooks/useCategories';
import { useTransactions, type TransactionFilters, type TransactionInput } from '../hooks/useTransactions';
import { useHouseholdToday } from '../hooks/useHouseholdToday';
import { parseAmountInput, formatCentsAsDollars, centsToAmountInputValue } from '../lib/money';
import { ApiError } from '../api/client';
import type { Transaction, TransactionType } from '../types/domain';

const TYPES: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'refund', label: 'Refund' },
  { value: 'transfer', label: 'Transfer' },
];

interface FormState {
  id: string | null;
  revision: number | null;
  date: string;
  description: string;
  type: TransactionType;
  amount: string;
  accountId: string;
  destinationAccountId: string;
  categoryId: string;
  notes: string;
}

function emptyForm(today: string, firstAccountId: string): FormState {
  return { id: null, revision: null, date: today, description: '', type: 'expense', amount: '', accountId: firstAccountId, destinationAccountId: '', categoryId: '', notes: '' };
}

export function RecordsPage() {
  const today = useHouseholdToday();
  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const [filters, setFilters] = useState<TransactionFilters>({ page: 1 });
  const { transactions, meta, loading, error, createTransaction, updateTransaction, deleteTransaction } = useTransactions(filters);
  const [form, setForm] = useState<FormState>(() => emptyForm(today, ''));
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dateTouched, setDateTouched] = useState(false);
  useEffect(() => {
    if (!dateTouched && !form.id) setForm((previous) => ({ ...previous, date: today }));
  }, [today, dateTouched, form.id]);

  const activeAccounts = useMemo(() => accounts.filter((account) => !account.archived_at), [accounts]);
  const sourceOptions = accounts.filter((account) => !account.archived_at || (form.id && account.id === form.accountId));
  const destinationOptions = accounts.filter((account) => !account.archived_at || (form.id && account.id === form.destinationAccountId));
  const requiredCategoryKind = form.type === 'income' ? 'income' : form.type === 'expense' || form.type === 'refund' ? 'expense' : null;
  const currentCategory = categories.find((category) => category.id === form.categoryId);
  const categoryOptions = categories.filter((category) => category.kind === requiredCategoryKind
    && (!category.archived_at || category.id === currentCategory?.id));

  function startEdit(transaction: Transaction) { setDateTouched(true);
    setForm({
      id: transaction.id,
      revision: transaction.revision,
      date: transaction.date,
      description: transaction.description,
      type: transaction.type,
      amount: centsToAmountInputValue(transaction.amount_cents),
      accountId: transaction.account_id,
      destinationAccountId: transaction.destination_account_id ?? '',
      categoryId: transaction.category_id ?? '',
      notes: transaction.notes ?? '',
    });
    setFormError(null);
  }

  function cancelEdit() {
    setForm(emptyForm(today, activeAccounts[0]?.id ?? '')); setDateTouched(false);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault(); if (submitting) return;
    setFormError(null);
    try {
      const amountCents = parseAmountInput(form.amount);
      const input: TransactionInput = {
        date: form.date,
        description: form.description,
        type: form.type,
        amountCents,
        accountId: form.accountId,
        destinationAccountId: form.type === 'transfer' ? form.destinationAccountId : null,
        categoryId: form.type === 'transfer' ? null : form.categoryId || null,
        notes: form.notes || null,
      };
      if (form.id && !window.confirm('Editing this record changes calculated totals. Continue?')) return;
      setSubmitting(true);
      if (form.id && form.revision !== null) {
        await updateTransaction(form.id, input, form.revision);
      } else {
        await createTransaction(input);
      }
      setForm(emptyForm(today, activeAccounts[0]?.id ?? '')); setDateTouched(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Could not save the record.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(transaction: Transaction) {
    if (submitting || !window.confirm('Deleting this record removes it from your calculated totals. Continue?')) return;
    setSubmitting(true); setFormError(null);
    try { await deleteTransaction(transaction.id, transaction.revision); }
    catch (err) { setFormError(err instanceof Error ? err.message : 'Could not delete the record.'); }
    finally { setSubmitting(false); }
  }
  function accountName(id: string | null): string {
    return accounts.find((account) => account.id === id)?.name ?? '—';
  }
  function categoryName(id: string | null): string {
    return categories.find((category) => category.id === id)?.name ?? '—';
  }

  return (
    <>
      <PageHeading title="Records" tagline="Every income, expense, refund, and transfer in one place." />

      <section className="panel">
        <h2>Filters</h2>
        <div>
          <label htmlFor="filter-date-from">From date</label>
          <input id="filter-date-from" type="date" value={filters.dateFrom ?? ''} onChange={(event) => setFilters((prev) => ({ ...prev, dateFrom: event.target.value || undefined, page: 1 }))} />
        </div>
        <div>
          <label htmlFor="filter-date-to">To date</label>
          <input id="filter-date-to" type="date" value={filters.dateTo ?? ''} onChange={(event) => setFilters((prev) => ({ ...prev, dateTo: event.target.value || undefined, page: 1 }))} />
        </div>
        <div>
          <label htmlFor="filter-text">Search text</label>
          <input id="filter-text" value={filters.text ?? ''} onChange={(event) => setFilters((prev) => ({ ...prev, text: event.target.value || undefined, page: 1 }))} />
        </div>
        <div>
          <label htmlFor="filter-type">Filter by type</label>
          <select id="filter-type" value={filters.type ?? ''} onChange={(event) => setFilters((prev) => ({ ...prev, type: event.target.value || undefined, page: 1 }))}>
            <option value="">All types</option>
            {TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="filter-account">Filter by account</label>
          <select id="filter-account" value={filters.accountId ?? ''} onChange={(event) => setFilters((prev) => ({ ...prev, accountId: event.target.value || undefined, page: 1 }))}>
            <option value="">All accounts</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="filter-category">Filter by category</label>
          <select id="filter-category" value={filters.categoryId ?? ''} onChange={(event) => setFilters((prev) => ({ ...prev, categoryId: event.target.value || undefined, page: 1 }))}>
            <option value="">All categories</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </div>
      </section>

      <form className="panel" onSubmit={handleSubmit} aria-label={form.id ? 'Edit record' : 'Add a record'}>
        <h2>{form.id ? 'Edit record' : 'Add a record'}</h2>
        <div>
          <label htmlFor="record-date">Date</label>
          <input id="record-date" type="date" value={form.date} onChange={(event) => { setDateTouched(true); setForm((prev) => ({ ...prev, date: event.target.value })); }} required />
        </div>
        <div>
          <label htmlFor="record-description">Description</label>
          <input id="record-description" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} required />
        </div>
        <div>
          <label htmlFor="record-type">Type</label>
          <select id="record-type" value={form.type} onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as TransactionType, categoryId: '' }))}>
            {TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="record-amount">Amount</label>
          <input id="record-amount" inputMode="decimal" placeholder="0.00" value={form.amount} onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))} required />
        </div>
        <div>
          <label htmlFor="record-account">Account</label>
          <select id="record-account" value={form.accountId} onChange={(event) => setForm((prev) => ({ ...prev, accountId: event.target.value }))} required>
            <option value="">Select an account</option>
            {sourceOptions.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </div>
        {form.type === 'transfer' ? (
          <div>
            <label htmlFor="record-destination">Destination account</label>
            <select id="record-destination" value={form.destinationAccountId} onChange={(event) => setForm((prev) => ({ ...prev, destinationAccountId: event.target.value }))} required>
              <option value="">Select a destination account</option>
              {destinationOptions.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label htmlFor="record-category">Category</label>
            <select id="record-category" value={form.categoryId} onChange={(event) => setForm((prev) => ({ ...prev, categoryId: event.target.value }))} required>
              <option value="">Select a category</option>
              {categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="record-notes">Notes (optional)</label>
          <textarea id="record-notes" value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
        </div>
        {formError && <p role="alert">{formError}</p>}
        <button type="submit" disabled={submitting}>{form.id ? 'Save changes' : 'Add record'}</button>
        {form.id && <button type="button" onClick={cancelEdit}>Cancel edit</button>}
      </form>

      {loading && <p>Loading records…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && transactions.length === 0 && (
        <section className="panel empty-state">
          <h2>Your transactions will appear here.</h2>
          <p className="muted">Add your first record above.</p>
        </section>
      )}
      {!loading && !error && transactions.length > 0 && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <caption className="muted">Records</caption>
              <thead>
                <tr><th>Date</th><th>Description</th><th>Type</th><th>Amount</th><th>Category</th><th>Account</th><th>Notes</th><th></th></tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{transaction.date}</td>
                    <td>{transaction.description}</td>
                    <td>{transaction.type}</td>
                    <td>{formatCentsAsDollars(transaction.amount_cents)}</td>
                    <td>{transaction.type === 'transfer' ? '—' : categoryName(transaction.category_id)}</td>
                    <td>{transaction.type === 'transfer' ? `${accountName(transaction.account_id)} → ${accountName(transaction.destination_account_id)}` : accountName(transaction.account_id)}</td>
                    <td>{transaction.notes ?? ''}</td>
                    <td>
                      <button type="button" disabled={submitting} onClick={() => startEdit(transaction)}>Edit</button>
                      <button type="button" disabled={submitting} onClick={() => handleDelete(transaction)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {meta && meta.totalPages > 1 && (
            <nav aria-label="Records pagination">
              <button type="button" disabled={meta.page <= 1} onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}>Previous</button>
              <span>Page {meta.page} of {meta.totalPages}</span>
              <button type="button" disabled={meta.page >= meta.totalPages} onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}>Next</button>
            </nav>
          )}
        </>
      )}
    </>
  );
}
