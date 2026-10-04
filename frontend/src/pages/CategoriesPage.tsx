import { useState, type FormEvent } from 'react';
import { PageHeading } from '../components/PageHeading';
import { useCategories } from '../hooks/useCategories';
import { ApiError } from '../api/client';
import type { Category, CategoryKind } from '../types/domain';

export function CategoriesPage() {
  const { categories, loading, error, createCategory, renameCategory, archiveCategory } = useCategories();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<Category | null>(null);
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault(); if (submitting) return;
    setFormError(null);
    try {
      setSubmitting(true);
      if (editing) await renameCategory(editing.id, name, editing.revision); else await createCategory(name, kind);
      setName(''); setEditing(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not create the category.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive(id: string, revision: number) {
    if (submitting || !window.confirm('Archiving a category keeps it on historical records but hides it from new entries. Continue?')) return;
    setSubmitting(true); setFormError(null);
    try { await archiveCategory(id, revision); }
    catch (err) { setFormError(err instanceof Error ? err.message : 'Could not archive the category.'); }
    finally { setSubmitting(false); }
  }

  function startEdit(category: Category) {
    setEditing(category); setName(category.name); setKind(category.kind); setFormError(null);
  }
  const expenseCategories = categories.filter((category) => category.kind === 'expense');
  const incomeCategories = categories.filter((category) => category.kind === 'income');

  function renderGroup(title: string, items: typeof categories) {
    if (items.length === 0) return null;
    return (
      <div style={{ overflowX: 'auto' }}>
        <table>
          <caption className="muted">{title}</caption>
          <thead><tr><th>Name</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {items.map((category) => (
              <tr key={category.id}>
                <td>{category.name}</td>
                <td>{category.archived_at ? 'Archived' : 'Active'}</td>
                <td>
                  <button type="button" disabled={submitting} onClick={() => startEdit(category)}>Edit</button>
                  {!category.archived_at && (
                    <button type="button" disabled={submitting} onClick={() => handleArchive(category.id, category.revision)}>Archive</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
      <PageHeading title="Categories" tagline="Your household, together." />

      <form className="panel" onSubmit={handleSubmit} aria-label={editing ? 'Edit a category' : 'Add a category'}>
        <h2>{editing ? 'Edit a category' : 'Add a category'}</h2>
        <div>
          <label htmlFor="category-name">Category name</label>
          <input id="category-name" value={name} onChange={(event) => setName(event.target.value)} required />
        </div>
        <div>
          <label htmlFor="category-kind">Category kind</label>
          <select id="category-kind" disabled={Boolean(editing) || submitting} value={kind} onChange={(event) => setKind(event.target.value as CategoryKind)}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </div>
        {formError && <p role="alert">{formError}</p>}
        <button type="submit" disabled={submitting}>{editing ? 'Save category' : 'Add category'}</button>
        {editing && <button type="button" disabled={submitting} onClick={() => { setEditing(null); setName(''); setFormError(null); }}>Cancel edit</button>}
      </form>

      {loading && <p>Loading categories…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && categories.length === 0 && (
        <section className="panel empty-state">
          <h2>No categories yet</h2>
          <p className="muted">Add your first category above.</p>
        </section>
      )}
      {!loading && !error && categories.length > 0 && (
        <>
          {renderGroup('Expense categories', expenseCategories)}
          {renderGroup('Income categories', incomeCategories)}
        </>
      )}
    </>
  );
}
