import { apiGet, ApiError } from './client';

export async function loadAllPages<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let expectedTotal: number | undefined;
  let expectedPageSize: number | undefined;
  for (let page = 1; ; page++) {
    const result = await apiGet<T[]>(`${path}${path.includes('?') ? '&' : '?'}page=${page}&pageSize=50`);
    const meta = result.meta;
    if (!Array.isArray(result.data) || !meta || meta.page !== page
      || !Number.isSafeInteger(meta.total) || meta.total < 0
      || !Number.isSafeInteger(meta.pageSize) || meta.pageSize < 1 || meta.pageSize > 200
      || meta.totalPages !== Math.max(1, Math.ceil(meta.total / meta.pageSize))
      || result.data.length > meta.pageSize) {
      throw new ApiError(502, 'INVALID_RESPONSE', 'The server returned invalid list pagination.');
    }
    if (expectedTotal !== undefined && (expectedTotal !== meta.total || expectedPageSize !== meta.pageSize)) {
      throw new ApiError(409, 'LIST_CHANGED', 'The list changed while loading. Please reload this page.');
    }
    expectedTotal = meta.total;
    expectedPageSize = meta.pageSize;
    items.push(...result.data);
    if (page >= meta.totalPages) {
      if (items.length !== meta.total) throw new ApiError(502, 'INVALID_RESPONSE', 'The server returned an incomplete list.');
      return items;
    }
  }
}
