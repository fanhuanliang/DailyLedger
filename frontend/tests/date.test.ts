import { describe, test, expect } from 'vitest';
import { formatDateInTimeZone } from '../src/lib/date';

describe('formatDateInTimeZone: household-timezone calendar date, never server/browser local time', () => {
  test('formats a UTC instant as a YYYY-MM-DD date in the given timezone', () => {
    const instant = new Date('2026-01-15T07:30:00.000Z');
    expect(formatDateInTimeZone(instant, 'America/Los_Angeles')).toBe('2026-01-14');
    expect(formatDateInTimeZone(instant, 'UTC')).toBe('2026-01-15');
  });
});
