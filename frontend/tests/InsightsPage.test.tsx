import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, describe, test, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from '../src/pages/DashboardPage';
import { ReportsPage } from '../src/pages/ReportsPage';
import { RecordsPage } from '../src/pages/RecordsPage';

const snapshot = {
  overview: { dateFrom: '2026-10-01', dateTo: '2026-10-31', incomeCents: 10000, netExpensesCents: -2000, moneyLeftOverCents: 12000, recordCount: 2 },
  categories: { totalNetExpensesCents: -2000, rows: [{ categoryId: 'c1', name: 'Groceries', netExpensesCents: -2000, percentage: null, recordCount: 1 }] },
  trends: { rows: [{ month: '2026-10', incomeCents: 10000, netExpensesCents: -2000, moneyLeftOverCents: 12000, recordCount: 2 }] },
  balances: { asOfDate: '2026-10-31', rows: [{ id: 'a1', name: 'Card', type: 'credit_card', balance_cents: -5000, archived_at: null }] },
  budgets: [{ year: 2026, overallLimitCents: null, overallRemainingCents: null, categoryRows: [] }],
  goalsAsOfDate: '2026-10-05', goals: [{ id: 'g1', name: 'Emergency fund', progressCents: 10000, targetCents: 20000, percentage: 50, surplusCents: 0, status: 'active' }],
  remindersAsOfDate: '2026-10-05', reminders: [{ id: 'r1', name: 'Rent', dueDate: '2026-10-01', amountCents: 50000, type: 'expense' }],
};
describe('AC6/AC7 insights and reports', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-05T18:00:00Z')); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
  function backend(fail = false) {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes('/settings')) return new Response(JSON.stringify({ data: { household_timezone: 'America/Los_Angeles' } }));
      if (fail) return new Response(JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Unable to load reports' } }), { status: 503 });
      if (url.includes('year-comparison')) return new Response(JSON.stringify({ data: { mode: 'matched', current: { dateFrom: '2026-01-01', dateTo: '2026-10-05', incomeCents: 10000, netExpensesCents: 2000, moneyLeftOverCents: 8000 }, previous: { dateFrom: '2025-01-01', dateTo: '2025-10-05', incomeCents: 9000, netExpensesCents: 1000, moneyLeftOverCents: 8000 }, currentYearIncomplete: false } }));
      return new Response(JSON.stringify({ data: snapshot }));
    }); vi.stubGlobal('fetch', fetchMock); return fetchMock;
  }
  test('dashboard defaults to household current month, shows real totals and labels current goals separately', async () => {
    const fetchMock = backend(); render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(await screen.findByText('Money left over')).toBeInTheDocument();
    expect(screen.getByText('$120.00')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Current goals' })).toBeInTheDocument();
    expect(screen.getByText(/Emergency fund:/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('dateFrom=2026-10-01&dateTo=2026-10-31'))).toBe(true);
    await userEvent.selectOptions(screen.getByLabelText('Period'), 'year');
    await userEvent.clear(screen.getByLabelText('Calendar year')); await userEvent.type(screen.getByLabelText('Calendar year'), '2025');
    await userEvent.click(screen.getByRole('button', { name: 'Apply period' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).includes('dateFrom=2025-01-01&dateTo=2025-12-31'))).toBe(true));
  });
  test('reports show negative refunds without misleading percentages and export selected period', async () => {
    backend(); render(<MemoryRouter><ReportsPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Category detail' })).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Export records CSV' })).toHaveAttribute('href', '/api/v1/exports/transactions.csv?dateFrom=2026-10-01&dateTo=2026-10-31');
    expect(screen.getByText(/Amount owed:/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Year comparison' })).toBeInTheDocument();
  });
  test('failed report fetch shows an error without displaying invented zero totals', async () => {
    backend(true); render(<MemoryRouter><ReportsPage /></MemoryRouter>);
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.every(alert => alert.textContent === 'Unable to load reports')).toBe(true);
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
  });
  test('Records CSV export carries current filters across all pages', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => new Response(JSON.stringify(String(input).includes('/settings') ? { data: { household_timezone: 'America/Los_Angeles' } } : { data: [], meta: { page: 1, pageSize: 50, total: 0, totalPages: 1 } }))));
    render(<MemoryRouter><RecordsPage /></MemoryRouter>);
    await userEvent.selectOptions(screen.getByLabelText('Filter by type'), 'expense');
    const link = screen.getByRole('link', { name: 'Export filtered records CSV' });
    const url = new URL(link.getAttribute('href')!, 'http://localhost');
    expect(url.searchParams.get('type')).toBe('expense');
    expect(url.searchParams.has('page')).toBe(false);
  });
});
