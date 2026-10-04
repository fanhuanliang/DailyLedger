import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../src/App';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetCsrfTokenCacheForTests } from '../src/api/client';

function jsonResponse(body: unknown, status = 200) {
  const payload = body as { data?: unknown; meta?: unknown };
  if (Array.isArray(payload.data) && payload.meta === undefined) {
    body = { ...payload, meta: { page: 1, pageSize: 50, total: payload.data.length, totalPages: 1 } };
  }
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function stubEmptyBackend() {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes('/settings')) return jsonResponse({ data: { household_timezone: 'America/Los_Angeles', currency: 'USD' } });
    if (url.includes('/transactions')) return jsonResponse({ data: [], meta: { page: 1, pageSize: 50, total: 0, totalPages: 1 } });
    return jsonResponse({ data: [] });
  }));
}

describe('Foundation: accessible navigation without fake records', () => {
  beforeEach(() => { resetCsrfTokenCacheForTests(); stubEmptyBackend(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  test('provides every sheet and a persistent Add transaction action', () => {
    render(<MemoryRouter><App /></MemoryRouter>);
    const nav = screen.getByRole('navigation', { name: 'Ledger sheets' });
    expect(nav).toBeInTheDocument();
    for (const label of ['Dashboard','Records','Accounts','Categories','Budgets','Goals','Reminders','Reports']) expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add transaction' })).toHaveAttribute('href', '/records?new=1');
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  test('switches to the Records sheet and shows the real (empty) records state', async () => {
    render(<MemoryRouter><App /></MemoryRouter>);
    await userEvent.click(screen.getByRole('link', { name: 'Records' }));
    expect(screen.getByRole('heading', { name: 'Records' })).toBeInTheDocument();
    expect(await screen.findByText('Your transactions will appear here.')).toBeInTheDocument();
  });
});
