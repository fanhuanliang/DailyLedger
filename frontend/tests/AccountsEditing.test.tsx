import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AccountsPage } from '../src/pages/AccountsPage';
import { resetCsrfTokenCacheForTests } from '../src/api/client';

const account = { id: 'a1', name: 'Checking', type: 'checking', opening_date: '2026-01-01', opening_balance_cents: 100000, balance_cents: 130000, balance_as_of: '2026-10-04', archived_at: null, revision: 3 };
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data, ...(Array.isArray(data) ? { meta: { page: 1, pageSize: 50, total: data.length, totalPages: 1 } } : {}) }), { status });
}
function backend(initial: unknown[] = []) {
  return vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/csrf-token')) return response({ csrfToken: 'token' });
    if (url.includes('/settings')) return response({ household_timezone: 'America/Los_Angeles', currency: 'USD' });
    if (init?.method === 'POST' || init?.method === 'PATCH') return response({ id: 'saved' }, 201);
    return response(initial);
  });
}
describe('Accounts: opening balance corrections and real current balances', () => {
  beforeEach(() => { resetCsrfTokenCacheForTests(); vi.spyOn(window, 'confirm').mockReturnValue(true); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
  test.each([['0.00', 0], ['-20.00', -2000]] as const)('allows opening balance %s', async (input, expected) => {
    const fetchMock = backend();
    vi.stubGlobal('fetch', fetchMock);
    render(<AccountsPage />);
    await screen.findByText(/no accounts yet/i);
    await userEvent.type(screen.getByLabelText(/account name/i), 'New checking');
    await userEvent.type(screen.getByLabelText(/starting balance/i), input);
    await userEvent.click(screen.getByRole('button', { name: /add account/i }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
      expect(call).toBeDefined();
      expect(JSON.parse(String(call![1]!.body)).openingBalanceCents).toBe(expected);
    });
  });
  test('shows computed current balance rather than the opening amount', async () => {
    vi.stubGlobal('fetch', backend([account]));
    render(<AccountsPage />);
    expect(await screen.findByText('$1,300.00')).toBeInTheDocument();
  });
  test('editing an opening balance warns about recalculation and includes expectedRevision', async () => {
    const fetchMock = backend([account]);
    vi.stubGlobal('fetch', fetchMock);
    render(<AccountsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /edit/i }));
    await userEvent.clear(screen.getByLabelText(/starting balance/i));
    await userEvent.type(screen.getByLabelText(/starting balance/i), '50.00');
    await userEvent.click(screen.getByRole('button', { name: /save account/i }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/recalculat.*balances/i));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
      expect(JSON.parse(String(call![1]!.body))).toMatchObject({ openingBalanceCents: 5000, expectedRevision: 3 });
    });
  });
  test('an untouched default date follows the loaded household timezone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T05:00:00Z'));
    let finishSettings!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => { finishSettings = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => String(input).includes('/settings') ? pending : response([])));
    render(<AccountsPage />);
    await screen.findByText(/no accounts yet/i);
    finishSettings(response({ household_timezone: 'America/New_York', currency: 'USD' }));
    await waitFor(() => expect(screen.getByLabelText(/opening date/i)).toHaveValue('2026-10-05'));
  });
});
