import { describe, test, expect } from 'vitest';
import { parseAmountInput, formatCentsAsDollars, centsToAmountInputValue } from '../src/lib/money';

describe('frontend money helpers: exact cent parsing and display (never parseFloat*100)', () => {
  test('parses a two-decimal dollar string into exact integer cents', () => {
    expect(parseAmountInput('12.34')).toBe(1234);
    expect(parseAmountInput('0.01')).toBe(1);
    expect(parseAmountInput(' 100 ')).toBe(10000);
  });

  test('rejects empty, zero, negative, and malformed amounts', () => {
    for (const input of ['', '0', '0.00', '-5', 'abc', '1.2', '1.234']) {
      expect(() => parseAmountInput(input)).toThrow();
    }
  });

  test('formats cents as a comma-grouped dollar string, negative with a leading minus', () => {
    expect(formatCentsAsDollars(123456)).toBe('$1,234.56');
    expect(formatCentsAsDollars(-123456)).toBe('-$1,234.56');
    expect(formatCentsAsDollars(0)).toBe('$0.00');
  });

  test('centsToAmountInputValue round-trips into an editable unsigned decimal string', () => {
    expect(centsToAmountInputValue(1234)).toBe('12.34');
    expect(centsToAmountInputValue(-5000)).toBe('50.00');
  });

  test('formatCentsAsDollars and parseAmountInput are exact even near Number.MAX_SAFE_INTEGER (no float collisions)', () => {
    expect(formatCentsAsDollars(9007199254740991)).toBe('$90,071,992,547,409.91');
    expect(formatCentsAsDollars(9007199254740990)).toBe('$90,071,992,547,409.90');
    expect(formatCentsAsDollars(9007199254740991)).not.toBe(formatCentsAsDollars(9007199254740990));
  });

  test('parseAmountInput and formatCentsAsDollars reject amounts outside the safe-integer range rather than silently wrapping', () => {
    expect(() => parseAmountInput('99999999999999999.99')).toThrow();
    expect(() => formatCentsAsDollars(Number.MAX_SAFE_INTEGER + 2)).toThrow();
  });
});
