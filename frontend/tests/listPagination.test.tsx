import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AccountsPage } from '../src/pages/AccountsPage';
import { CategoriesPage } from '../src/pages/CategoriesPage';

function response(data: unknown, page = 1) {
  return new Response(JSON.stringify({ data, meta: { page, pageSize: 50, total: 51, totalPages: 2 } }), { headers: { 'Content-Type': 'application/json' } });
}

describe('Complete paginated account and category loading', () => {
  afterEach(() => vi.unstubAllGlobals());
  test('Accounts displays the account from page two', async () => {
    const account = { id: 'first', name: 'First account', type: 'cash', opening_date: '2026-01-01', opening_balance_cents: 0, archived_at: null, revision: 1 };
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes('/settings')) return new Response(JSON.stringify({ data: { household_timezone: 'America/Los_Angeles', currency: 'USD' } }));
      if (url.includes('page=2')) return response([{ ...account, id: 'last', name: 'Last account' }], 2);
      return response(Array.from({ length: 50 }, (_, index) => ({ ...account, id: String(index), name: `Account ${index}` })));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<AccountsPage />);
    expect(await screen.findByText('Last account')).toBeInTheDocument();
  });
  test('Categories displays the category from page two', async () => {
    const category = { id: 'first', name: 'First category', kind: 'expense', archived_at: null, revision: 1 };
    const fetchMock = vi.fn(async (input: unknown) => String(input).includes('page=2')
      ? response([{ ...category, id: 'last', name: 'Last category' }], 2)
      : response(Array.from({ length: 50 }, (_, index) => ({ ...category, id: String(index), name: `Category ${index}` }))));
    vi.stubGlobal('fetch', fetchMock);
    render(<CategoriesPage />);
    expect(await screen.findByText('Last category')).toBeInTheDocument();
  });
});
