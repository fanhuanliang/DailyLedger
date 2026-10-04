import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { AccountsPage } from '../src/pages/AccountsPage';
import { resetCsrfTokenCacheForTests } from '../src/api/client';

function jsonResponse(body: unknown, status = 200) {
  const accountPayload = body as { data?: unknown };
  if (Array.isArray(accountPayload.data)) {
    body = { ...accountPayload, data: accountPayload.data.map((item: Record<string, unknown>) => ({ ...item, balance_cents: item.balance_cents ?? item.opening_balance_cents, balance_as_of: '2026-10-04' })) };
  }
  const payload = body as { data?: unknown; meta?: unknown };
  if (Array.isArray(payload.data) && payload.meta === undefined) {
    body = { ...payload, meta: { page: 1, pageSize: 50, total: payload.data.length, totalPages: 1 } };
  }
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('AccountsPage: create, list, and archive accounts', () => {
  beforeEach(() => { resetCsrfTokenCacheForTests(); vi.spyOn(window, 'confirm').mockReturnValue(true); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  test('shows an empty-state prompt when there are no accounts yet', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [] })));
    render(<AccountsPage />);
    expect(await screen.findByText(/no accounts yet/i)).toBeInTheDocument();
  });

  test('shows an error state when accounts cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'Service unavailable.' } }, 500)));
    render(<AccountsPage />);
    expect(await screen.findByText('Service unavailable.')).toBeInTheDocument();
  });

  test('lists accounts and shows a credit card balance as amount owed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: [
        { id: 'a1', name: 'Checking', type: 'checking', opening_date: '2026-01-01', opening_balance_cents: 100000, archived_at: null, revision: 1, created_at: '', updated_at: '' },
        { id: 'a2', name: 'Visa', type: 'credit_card', opening_date: '2026-01-01', opening_balance_cents: -5000, archived_at: null, revision: 1, created_at: '', updated_at: '' },
      ],
    })));
    render(<AccountsPage />);
    expect(await screen.findByText('Checking')).toBeInTheDocument();
    expect(screen.getByText('$1,000.00')).toBeInTheDocument();
    expect(screen.getByText(/\$50\.00 owed/i)).toBeInTheDocument();
  });

  test('creating an account submits the form with keyboard-accessible labels and reloads the list', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ data: { household_timezone: 'America/Los_Angeles', currency: 'USD' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { csrfToken: 'tok' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'new-id' } }, 201))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'new-id', name: 'Cash Jar', type: 'cash', opening_date: '2026-01-01', opening_balance_cents: 2000, archived_at: null, revision: 1, created_at: '', updated_at: '' }] }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AccountsPage />);
    await screen.findByText(/no accounts yet/i);

    await userEvent.type(screen.getByLabelText(/account name/i), 'Cash Jar');
    await userEvent.selectOptions(screen.getByLabelText(/account type/i), 'cash');
    await userEvent.clear(screen.getByLabelText(/opening date/i));
    await userEvent.type(screen.getByLabelText(/opening date/i), '2026-01-01');
    await userEvent.type(screen.getByLabelText(/starting balance/i), '20.00');
    await userEvent.click(screen.getByRole('button', { name: /add account/i }));

    expect(await screen.findByText('Cash Jar')).toBeInTheDocument();
    const createCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/accounts') && call[1]?.method === 'POST');
    expect(createCall).toBeTruthy();
    expect(JSON.parse(createCall![1].body)).toMatchObject({ name: 'Cash Jar', type: 'cash', openingDate: '2026-01-01', openingBalanceCents: 2000 });
  });

  test('archiving an account confirms the effect and sends the current revision', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'a1', name: 'Checking', type: 'checking', opening_date: '2026-01-01', opening_balance_cents: 0, archived_at: null, revision: 1, created_at: '', updated_at: '' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: { household_timezone: 'America/Los_Angeles', currency: 'USD' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { csrfToken: 'tok' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'a1', archived_at: 'now' } }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'a1', name: 'Checking', type: 'checking', opening_date: '2026-01-01', opening_balance_cents: 0, archived_at: '2026-02-01T00:00:00.000Z', revision: 2, created_at: '', updated_at: '' }] }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AccountsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /archive/i }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('cannot receive new entries'));
    await waitFor(() => expect(screen.getByText(/archived/i)).toBeInTheDocument());
    const archiveCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/archive'));
    expect(JSON.parse(archiveCall![1].body)).toEqual({ expectedRevision: 1 });
  });
});
