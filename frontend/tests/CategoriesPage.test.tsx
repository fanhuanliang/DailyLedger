import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { CategoriesPage } from '../src/pages/CategoriesPage';
import { resetCsrfTokenCacheForTests } from '../src/api/client';

function jsonResponse(body: unknown, status = 200) {
  const payload = body as { data?: unknown; meta?: unknown };
  if (Array.isArray(payload.data) && payload.meta === undefined) {
    body = { ...payload, meta: { page: 1, pageSize: 50, total: payload.data.length, totalPages: 1 } };
  }
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('CategoriesPage: create, rename, and archive categories by kind', () => {
  beforeEach(() => { resetCsrfTokenCacheForTests(); vi.spyOn(window, 'confirm').mockReturnValue(true); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  test('shows an empty-state prompt when there are no categories yet', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [] })));
    render(<CategoriesPage />);
    expect(await screen.findByText(/no categories yet/i)).toBeInTheDocument();
  });

  test('lists categories grouped by kind', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: [
        { id: 'c1', name: 'Groceries', kind: 'expense', archived_at: null, revision: 1, created_at: '', updated_at: '' },
        { id: 'c2', name: 'Salary', kind: 'income', archived_at: null, revision: 1, created_at: '', updated_at: '' },
      ],
    })));
    render(<CategoriesPage />);
    expect(await screen.findByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('Salary')).toBeInTheDocument();
  });

  test('creating a category uses accessible labels and a duplicate name shows the server message', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ data: { csrfToken: 'tok' } }))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'UNPROCESSABLE', message: 'An active expense category named "Dining" already exists.', fields: { name: 'duplicate' } } }, 422));
    vi.stubGlobal('fetch', fetchMock);
    render(<CategoriesPage />);
    await screen.findByText(/no categories yet/i);
    await userEvent.type(screen.getByLabelText(/category name/i), 'Dining');
    await userEvent.selectOptions(screen.getByLabelText(/category kind/i), 'expense');
    await userEvent.click(screen.getByRole('button', { name: /add category/i }));
    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
  });

  test('archiving explains the effect and sends the current revision', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'c1', name: 'Groceries', kind: 'expense', archived_at: null, revision: 1, created_at: '', updated_at: '' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: { csrfToken: 'tok' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'c1' } }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'c1', name: 'Groceries', kind: 'expense', archived_at: '2026-02-01T00:00:00.000Z', revision: 2, created_at: '', updated_at: '' }] }));
    vi.stubGlobal('fetch', fetchMock);
    render(<CategoriesPage />);
    await userEvent.click(await screen.findByRole('button', { name: /archive/i }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('historical records'));
    await waitFor(() => expect(screen.getByText(/archived/i)).toBeInTheDocument());
    const archiveCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/archive'));
    expect(JSON.parse(archiveCall![1].body)).toEqual({ expectedRevision: 1 });
  });
});
