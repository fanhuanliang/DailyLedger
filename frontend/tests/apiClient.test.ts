import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiGet, apiPost, ApiError, resetCsrfTokenCacheForTests } from '../src/api/client';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('API client: CSRF-aware fetch wrapper', () => {
  beforeEach(() => { resetCsrfTokenCacheForTests(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  test('GET requests do not fetch a CSRF token and return the data payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: '1' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await apiGet('/accounts');
    expect(result.data).toEqual([{ id: '1' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ credentials: 'same-origin' });
  });

  test('POST requests fetch a CSRF token once, cache it, and send it as a header', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { csrfToken: 'tok-123' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'new' } }, 201))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'new2' } }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await apiPost('/accounts', { name: 'Checking' });
    await apiPost('/accounts', { name: 'Savings' });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const secondCallHeaders = fetchMock.mock.calls[1]![1].headers;
    expect(secondCallHeaders['X-CSRF-Token']).toBe('tok-123');
    const thirdCallHeaders = fetchMock.mock.calls[2]![1].headers;
    expect(thirdCallHeaders['X-CSRF-Token']).toBe('tok-123');
  });

  test('a non-OK response throws an ApiError carrying code, message, and fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'BAD_REQUEST', message: 'name is required.', fields: { name: 'required' } } }, 400),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiGet('/accounts')).rejects.toMatchObject({
      code: 'BAD_REQUEST', message: 'name is required.', fields: { name: 'required' },
    });
    await expect(apiGet('/accounts')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('CSRF recovery and initialization safety', () => {
  beforeEach(() => resetCsrfTokenCacheForTests());
  afterEach(() => vi.unstubAllGlobals());

  test('refreshes a rejected session token once and retries the identical write after restart', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { csrfToken: 'old' } }))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'CSRF_REQUIRED', message: 'Expired session' } }, 403))
      .mockResolvedValueOnce(jsonResponse({ data: { csrfToken: 'fresh' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'saved' } }, 201));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiPost('/accounts', { name: 'Checking' })).resolves.toMatchObject({ data: { id: 'saved' } });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1]![1].headers['X-CSRF-Token']).toBe('old');
    expect(fetchMock.mock.calls[3]![1].headers['X-CSRF-Token']).toBe('fresh');
    expect(fetchMock.mock.calls[3]![1].body).toBe(fetchMock.mock.calls[1]![1].body);
  });

  test('stops after a second CSRF rejection instead of looping', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { csrfToken: 'old' } }))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'CSRF_REQUIRED', message: 'Rejected' } }, 403))
      .mockResolvedValueOnce(jsonResponse({ data: { csrfToken: 'fresh' } }))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'CSRF_REQUIRED', message: 'Rejected again' } }, 403));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiPost('/accounts', {})).rejects.toMatchObject({ status: 403, message: 'Rejected again' });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  test('never retries a forbidden-origin response or ambiguous network failure', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { csrfToken: 'token' } }))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'CROSS_SITE_BLOCKED', message: 'Blocked' } }, 403))
      .mockRejectedValueOnce(new TypeError('Network failure'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiPost('/accounts', {})).rejects.toMatchObject({ code: 'CROSS_SITE_BLOCKED' });
    await expect(apiPost('/accounts', {})).rejects.toThrow('Network failure');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('does not issue a write after unsuccessful token initialization', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ error: { code: 'NOT_READY', message: 'Unavailable' } }, 503));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiPost('/accounts', {})).rejects.toMatchObject({ status: 503, code: 'NOT_READY' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('does not issue a write with a missing or malformed token', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: { csrfToken: '' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiPost('/accounts', {})).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('concurrent initial writes share one token initialization', async () => {
    let completeToken!: (response: Response) => void;
    const tokenResponse = new Promise<Response>((resolve) => { completeToken = resolve; });
    const fetchMock = vi.fn((url: string) => url.endsWith('/csrf-token')
      ? tokenResponse.then((response) => response.clone()) : Promise.resolve(jsonResponse({ data: { id: 'saved' } }, 201)));
    vi.stubGlobal('fetch', fetchMock);
    const first = apiPost('/accounts', { name: 'First' });
    const second = apiPost('/accounts', { name: 'Second' });
    completeToken(jsonResponse({ data: { csrfToken: 'shared' } }));
    await Promise.all([first, second]);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/csrf-token'))).toHaveLength(1);
  });
});
