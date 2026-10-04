const API_BASE = '/api/v1';
const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) { super(message); }
}

export interface ApiResult<T> {
  data: T;
  meta?: { page: number; pageSize: number; total: number; totalPages: number };
}

let cachedCsrfToken: string | null = null;
let pendingCsrfToken: Promise<string> | null = null;

export function resetCsrfTokenCacheForTests(): void {
  cachedCsrfToken = null;
  pendingCsrfToken = null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readResponse<T>(response: Response): Promise<ApiResult<T>> {
  const parsed: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = isObject(parsed) && isObject(parsed.error) ? parsed.error : {};
    const fields = isObject(error.fields) && Object.values(error.fields).every((value) => typeof value === 'string')
      ? error.fields as Record<string, string> : undefined;
    throw new ApiError(response.status,
      typeof error.code === 'string' ? error.code : 'UNKNOWN_ERROR',
      typeof error.message === 'string' ? error.message : 'An unexpected error occurred.', fields);
  }
  if (!isObject(parsed) || !Object.hasOwn(parsed, 'data')) {
    throw new ApiError(response.status, 'INVALID_RESPONSE', 'The server returned an invalid response.');
  }
  return parsed as unknown as ApiResult<T>;
}

async function ensureCsrfToken(): Promise<string> {
  if (cachedCsrfToken) return cachedCsrfToken;
  if (!pendingCsrfToken) {
    pendingCsrfToken = (async () => {
      const response = await fetch(`${API_BASE}/csrf-token`, { credentials: 'same-origin', cache: 'no-store' });
      const body = await readResponse<unknown>(response);
      if (!isObject(body.data) || typeof body.data.csrfToken !== 'string' || body.data.csrfToken.trim().length === 0) {
        throw new ApiError(response.status, 'INVALID_RESPONSE', 'The server did not provide a valid session token.');
      }
      cachedCsrfToken = body.data.csrfToken;
      return cachedCsrfToken;
    })().finally(() => { pendingCsrfToken = null; });
  }
  return pendingCsrfToken;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  const isWrite = WRITE_METHODS.has(method);
  const encodedBody = body === undefined ? undefined : JSON.stringify(body);
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = isWrite ? await ensureCsrfToken() : null;
    const headers: Record<string, string> = {};
    if (token) headers['X-CSRF-Token'] = token;
    if (encodedBody !== undefined) headers['Content-Type'] = 'application/json';
    // Network errors are deliberately not retried: the server may have saved the write.
    const response = await fetch(`${API_BASE}${path}`, { method, credentials: 'same-origin', headers, body: encodedBody });
    try { return await readResponse<T>(response); }
    catch (error) {
      // This specific rejection occurs before any ledger mutation; retry it once only.
      if (isWrite && attempt === 0 && error instanceof ApiError && error.status === 403 && error.code === 'CSRF_REQUIRED') {
        if (cachedCsrfToken === token) cachedCsrfToken = null;
        continue;
      }
      throw error;
    }
  }
  throw new ApiError(403, 'CSRF_REQUIRED', 'The session could not be refreshed.');
}

export function apiGet<T>(path: string): Promise<ApiResult<T>> { return request<T>('GET', path); }
export function apiPost<T>(path: string, body?: unknown): Promise<ApiResult<T>> { return request<T>('POST', path, body); }
export function apiPatch<T>(path: string, body?: unknown): Promise<ApiResult<T>> { return request<T>('PATCH', path, body); }
export function apiDelete<T>(path: string, body?: unknown): Promise<ApiResult<T>> { return request<T>('DELETE', path, body); }
