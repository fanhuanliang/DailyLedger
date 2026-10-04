import { badRequest } from './errors';

export function requireExpectedRevision(body: Record<string, unknown> | undefined): number {
  const value = body?.expectedRevision;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw badRequest('expectedRevision is required.', { expectedRevision: 'required' });
  }
  return value;
}
