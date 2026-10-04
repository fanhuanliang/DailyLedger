import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { RecordsPage } from '../src/pages/RecordsPage';
import { resetCsrfTokenCacheForTests } from '../src/api/client';

function jsonResponse(body: unknown, status = 200) {
  const payload = body as { data?: unknown; meta?: unknown };
  if (Array.isArray(payload.data) && payload.meta === undefined) {
    body = { ...payload, meta: { page: 1, pageSize: 50, total: payload.data.length, totalPages: 1 } };
  }
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const accounts = [
  { id: 'acc-checking', name: 'Checking', type: 'checking', opening_date: '2026-01-01', opening_balance_cents: 100000, archived_at: null, revision: 1, created_at: '', updated_at: '' },
  { id: 'acc-visa', name: 'Visa', type: 'credit_card', opening_date: '2026-01-01', opening_balance_cents: 0, archived_at: null, revision: 1, created_at: '', updated_at: '' },
];
const categories = [
  { id: 'cat-dining', name: 'Dining', kind: 'expense', archived_at: null, revision: 1, created_at: '', updated_at: '' },
  { id: 'cat-salary', name: 'Salary', kind: 'income', archived_at: null, revision: 1, created_at: '', updated_at: '' },
  { id: 'cat-old-hobby', name: 'Old Hobby', kind: 'expense', archived_at: '2026-01-01T00:00:00.000Z', revision: 2, created_at: '', updated_at: '' },
];
function emptyList() {
  return jsonResponse({ data: [], meta: { page: 1, pageSize: 50, total: 0, totalPages: 1 } });
}
function settingsResponse() {
  return jsonResponse({ data: { household_timezone: 'America/Los_Angeles', currency: 'USD' } });
}

function routedFetch(transactionsResponder: (url: string) => Response) {
  return vi.fn(async (input: unknown, _init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/accounts')) return jsonResponse({ data: accounts });
    if (url.includes('/categories')) return jsonResponse({ data: categories });
    if (url.includes('/settings')) return settingsResponse();
    if (url.includes('/csrf-token')) return jsonResponse({ data: { csrfToken: 'tok' } });
    if (url.includes('/transactions')) return transactionsResponder(url);
    throw new Error(`Unmocked fetch: ${url}`);
  });
}

describe('RecordsPage: entry form, filters, edit, and delete', () => {
  beforeEach(() => { resetCsrfTokenCacheForTests(); vi.spyOn(window, 'confirm').mockReturnValue(true); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  test('shows an empty-state prompt when there are no records yet', async () => {
    vi.stubGlobal('fetch', routedFetch(() => emptyList()));
    render(<RecordsPage />);
    expect(await screen.findByText(/your transactions will appear here/i)).toBeInTheDocument();
  });

  test('an income entry requires a category and a transfer requires a destination account with no category', async () => {
    vi.stubGlobal('fetch', routedFetch(() => emptyList()));
    render(<RecordsPage />);
    await screen.findByText(/your transactions will appear here/i);

    await userEvent.type(screen.getByLabelText(/description/i), 'Paycheck');
    await userEvent.selectOptions(screen.getByLabelText(/^type$/i), 'income');
    await userEvent.type(screen.getByLabelText(/^amount$/i), '500.00');
    await userEvent.selectOptions(screen.getByLabelText(/^account$/i), 'acc-checking');
    expect(screen.getByLabelText(/^category$/i)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/^type$/i), 'transfer');
    expect(screen.queryByLabelText(/^category$/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/destination account/i)).toBeInTheDocument();
  });

  test('an archived category is not offered for a new expense entry', async () => {
    vi.stubGlobal('fetch', routedFetch(() => emptyList()));
    render(<RecordsPage />);
    await screen.findByText(/your transactions will appear here/i);
    const categorySelect = screen.getByLabelText(/^category$/i);
    const optionLabels = Array.from(categorySelect.querySelectorAll('option')).map((option) => option.textContent);
    expect(optionLabels).toContain('Dining');
    expect(optionLabels).not.toContain('Old Hobby');
  });

  test('editing an existing record that references an archived category still shows it selected', async () => {
    const row = { id: 't1', date: '2026-01-05', description: 'Old hobby spend', type: 'expense', amount_cents: 1200, account_id: 'acc-checking', destination_account_id: null, category_id: 'cat-old-hobby', notes: null, source: 'manual', revision: 1, created_at: '', updated_at: '' };
    const fetchMock = routedFetch((url) => (url.includes('page=') ? jsonResponse({ data: [row], meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 } }) : emptyList()));
    vi.stubGlobal('fetch', fetchMock);
    render(<RecordsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /edit/i }));
    const categorySelect = screen.getByLabelText(/^category$/i) as HTMLSelectElement;
    expect(categorySelect.value).toBe('cat-old-hobby');
  });

  test('creating a transaction sends exact integer cents and reloads the list', async () => {
    let created = false;
    const fetchMock = routedFetch((url) => {
      if (url.includes('page=') && created) {
        return jsonResponse({ data: [{ id: 't1', date: '2026-01-05', description: 'Coffee', type: 'expense', amount_cents: 450, account_id: 'acc-checking', destination_account_id: null, category_id: 'cat-dining', notes: null, source: 'manual', revision: 1, created_at: '', updated_at: '' }], meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 } });
      }
      return emptyList();
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<RecordsPage />);
    await screen.findByText(/your transactions will appear here/i);

    await userEvent.type(screen.getByLabelText(/description/i), 'Coffee');
    await userEvent.selectOptions(screen.getByLabelText(/^account$/i), 'acc-checking');
    await userEvent.selectOptions(screen.getByLabelText(/^category$/i), 'cat-dining');
    await userEvent.type(screen.getByLabelText(/^amount$/i), '4.50');
    created = true;
    await userEvent.click(screen.getByRole('button', { name: /add record/i }));

    expect(await screen.findByText('Coffee')).toBeInTheDocument();
    const postCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/transactions') && call[1]?.method === 'POST');
    expect(JSON.parse(postCall![1]!.body as string)).toMatchObject({ description: 'Coffee', amountCents: 450, accountId: 'acc-checking', categoryId: 'cat-dining', type: 'expense' });
  });

  test('deleting a record explains that totals change and sends the current revision', async () => {
    const row = { id: 't1', date: '2026-01-05', description: 'Coffee', type: 'expense', amount_cents: 450, account_id: 'acc-checking', destination_account_id: null, category_id: 'cat-dining', notes: null, source: 'manual', revision: 1, created_at: '', updated_at: '' };
    let deleted = false;
    const fetchMock = routedFetch((url) => {
      if (url.includes('page=')) return deleted ? emptyList() : jsonResponse({ data: [row], meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 } });
      return emptyList();
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<RecordsPage />);
    await screen.findByText('Coffee');
    deleted = true;
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('calculated totals'));
    await waitFor(() => expect(screen.getByText(/your transactions will appear here/i)).toBeInTheDocument());
    const deleteCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'DELETE');
    expect(JSON.parse(deleteCall![1]!.body as string)).toEqual({ expectedRevision: 1 });
  });

  test('filtering by type reloads the list with the selected query parameter', async () => {
    const fetchMock = routedFetch(() => emptyList());
    vi.stubGlobal('fetch', fetchMock);
    render(<RecordsPage />);
    await screen.findByText(/your transactions will appear here/i);
    await userEvent.selectOptions(screen.getByLabelText(/filter by type/i), 'income');
    await waitFor(() => {
      const lastListCall = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/transactions')).pop();
      expect(String(lastListCall![0])).toContain('type=income');
    });
  });
});
