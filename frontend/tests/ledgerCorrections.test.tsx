import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CategoriesPage } from '../src/pages/CategoriesPage';
import { RecordsPage } from '../src/pages/RecordsPage';
import { resetCsrfTokenCacheForTests } from '../src/api/client';

function response(data: unknown) {
  return new Response(JSON.stringify({ data, ...(Array.isArray(data) ? { meta: { page: 1, pageSize: 50, total: data.length, totalPages: 1 } } : {}) }));
}
const category = { id: 'c1', name: 'Groceries', kind: 'expense', archived_at: null, revision: 4 };
describe('Category corrections and household date defaults', () => {
  beforeEach(() => { resetCsrfTokenCacheForTests(); vi.spyOn(window, 'confirm').mockReturnValue(true); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
  test('renames a category with revision protection without changing its kind', async () => {
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      if (String(input).includes('/csrf-token')) return response({ csrfToken: 'token' });
      if (init?.method === 'PATCH') return response(category);
      return response([category]);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<CategoriesPage />);
    await userEvent.click(await screen.findByRole('button', { name: /edit/i }));
    await userEvent.clear(screen.getByLabelText(/category name/i));
    await userEvent.type(screen.getByLabelText(/category name/i), 'Food');
    expect(screen.getByLabelText(/category kind/i)).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /save category/i }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
      expect(call).toBeDefined();
      expect(JSON.parse(String(call![1]!.body))).toEqual({ name: 'Food', expectedRevision: 4 });
    });
  });
  test('shows an archive rejection so the user knows the category was not saved', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
      if (String(input).includes('/csrf-token')) return response({ csrfToken: 'token' });
      if (init?.method === 'POST') return new Response(JSON.stringify({ error: { code: 'CONFLICT', message: 'Category changed. Reload and try again.' } }), { status: 409 });
      return response([category]);
    }));
    render(<CategoriesPage />);
    await userEvent.click(await screen.findByRole('button', { name: /archive/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Category changed. Reload and try again.');
  });
  test('new record date follows loaded household timezone, while explicit user date is preserved', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-05T05:00:00Z'));
    let settings!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => { settings = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => String(input).includes('/settings') ? pending : response([])));
    render(<RecordsPage />);
    await screen.findByText(/your transactions will appear here/i);
    settings(response({ household_timezone: 'America/New_York', currency: 'USD' }));
    await waitFor(() => expect(screen.getByLabelText(/^date$/i)).toHaveValue('2026-10-05'));
    await userEvent.clear(screen.getByLabelText(/^date$/i));
    await userEvent.type(screen.getByLabelText(/^date$/i), '2026-02-03');
    expect(screen.getByLabelText(/^date$/i)).toHaveValue('2026-02-03');
  });
});


describe('Mutation controls while a write is pending', () => {
  beforeEach(() => { resetCsrfTokenCacheForTests(); vi.spyOn(window, 'confirm').mockReturnValue(true); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  test('category archive disables mutation controls until completion', async () => {
    let finish!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => { finish = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
      if (String(input).includes('/csrf-token')) return response({ csrfToken: 'token' });
      if (init?.method === 'POST') return pending;
      return response([category]);
    }));
    render(<CategoriesPage />);
    const archive = await screen.findByRole('button', { name: /archive/i });
    await userEvent.click(archive);
    try { expect(archive).toBeDisabled(); }
    finally { await act(async () => { finish(response(category)); }); }
  });
  test('record deletion disables the delete action until completion', async () => {
    const row = { id: 't1', date: '2026-01-02', description: 'Test purchase', type: 'expense', amount_cents: 100, account_id: 'a1', destination_account_id: null, category_id: 'c1', notes: null, source: 'manual', revision: 1 };
    let finish!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => { finish = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/csrf-token')) return response({ csrfToken: 'token' });
      if (url.includes('/settings')) return response({ household_timezone: 'America/Los_Angeles', currency: 'USD' });
      if (init?.method === 'DELETE') return pending;
      if (url.includes('/transactions')) return response([row]);
      return response([]);
    }));
    render(<RecordsPage />);
    const remove = await screen.findByRole('button', { name: /delete/i });
    await userEvent.click(remove);
    try { expect(remove).toBeDisabled(); }
    finally { await act(async () => { finish(response({ deleted: true })); }); }
  });
});

describe('Historical record corrections', () => {
  beforeEach(() => { resetCsrfTokenCacheForTests(); vi.spyOn(window, 'confirm').mockReturnValue(true); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  test.each([null, '2026-10-01T00:00:00Z'])('retains original account and warns about totals before saving (archive=%s)', async (archived_at) => {
    const row = { id: 't1', date: '2026-01-02', description: 'Original purchase', type: 'expense', amount_cents: 100, account_id: 'a1', destination_account_id: null, category_id: 'c1', notes: null, source: 'manual', revision: 1 };
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/csrf-token')) return response({ csrfToken: 'token' });
      if (url.includes('/settings')) return response({ household_timezone: 'America/Los_Angeles', currency: 'USD' });
      if (init?.method === 'PATCH') return response(row);
      if (url.includes('/transactions')) return response([row]);
      if (url.includes('/accounts')) return response([{ id: 'a1', name: 'Checking', type: 'checking', opening_date: '2026-01-01', opening_balance_cents: 0, archived_at, revision: 1 }]);
      return response([category]);
    }));
    render(<RecordsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /^edit$/i }));
    expect(screen.getByLabelText(/^account$/i)).toHaveValue('a1');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('calculated totals'));
  });
});

describe('Archived transfer destination correction', () => {
  beforeEach(() => { resetCsrfTokenCacheForTests(); vi.spyOn(window, 'confirm').mockReturnValue(true); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  test('keeps the original archived destination selected and submits its unchanged id', async () => {
    const row = { id: 'transfer1', date: '2026-01-02', description: 'Old transfer', type: 'transfer', amount_cents: 100, account_id: 'a1', destination_account_id: 'a2', category_id: null, notes: null, source: 'manual', revision: 1 };
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/csrf-token')) return response({ csrfToken: 'token' });
      if (url.includes('/settings')) return response({ household_timezone: 'America/Los_Angeles', currency: 'USD' });
      if (init?.method === 'PATCH') return response(row);
      if (url.includes('/transactions')) return response([row]);
      if (url.includes('/accounts')) return response([
        { id: 'a1', name: 'Checking', type: 'checking', archived_at: null, revision: 1 },
        { id: 'a2', name: 'Old savings', type: 'savings', archived_at: '2026-10-01T00:00:00Z', revision: 1 },
      ]);
      return response([]);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<RecordsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /^edit$/i }));
    expect(screen.getByLabelText(/^destination account$/i)).toHaveValue('a2');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true));
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ accountId: 'a1', destinationAccountId: 'a2', expectedRevision: 1 });
  });
});
