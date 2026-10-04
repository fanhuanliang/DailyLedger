import { isValidCalendarDate } from '../src/lib/calendarDate';

describe('isValidCalendarDate: real calendar-day validation beyond regex shape', () => {
  test('accepts real calendar dates including leap-day Feb 29 2024', () => {
    expect(isValidCalendarDate('2026-01-01')).toBe(true);
    expect(isValidCalendarDate('2024-02-29')).toBe(true);
    expect(isValidCalendarDate('2026-12-31')).toBe(true);
  });

  test('rejects dates that do not exist on the calendar', () => {
    expect(isValidCalendarDate('2026-02-31')).toBe(false);
    expect(isValidCalendarDate('2025-02-29')).toBe(false);
    expect(isValidCalendarDate('2026-04-31')).toBe(false);
    expect(isValidCalendarDate('2026-13-01')).toBe(false);
    expect(isValidCalendarDate('2026-00-10')).toBe(false);
    expect(isValidCalendarDate('2026-01-00')).toBe(false);
  });

  test('rejects malformed shapes', () => {
    expect(isValidCalendarDate('2026-1-1')).toBe(false);
    expect(isValidCalendarDate('01-01-2026')).toBe(false);
    expect(isValidCalendarDate('not-a-date')).toBe(false);
    expect(isValidCalendarDate('')).toBe(false);
  });
});
