import { badRequest } from './errors';

export interface PageRequest {
  page: number;
  pageSize: number;
}

function toScalar(value: unknown, field: string): string | number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' && typeof value !== 'number') throw badRequest(`${field} must be a single number.`, { [field]: 'invalid' });
  return value;
}

export function parsePageRequest(query: Record<string, unknown>): PageRequest {
  const rawPage = toScalar(query.page, 'page');
  const rawPageSize = toScalar(query.pageSize, 'pageSize');
  const page = rawPage === undefined ? 1 : Number(rawPage);
  const pageSize = rawPageSize === undefined ? 50 : Number(rawPageSize);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger((page - 1) * pageSize)) throw badRequest('page must be a positive integer.');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) throw badRequest('pageSize must be between 1 and 200.');
  return { page, pageSize };
}

export function paginationMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function parseIncludeArchived(value: unknown): boolean {
  if (value === undefined || value === 'false') return false;
  if (value === 'true') return true;
  throw badRequest('includeArchived must be true or false.', { includeArchived: 'invalid' });
}
