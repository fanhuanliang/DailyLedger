import { parseCentsFromInput, isSafeCents, roundHalfUpCents, formatCentsAsDollars } from '../src/lib/money';

describe('money: integer-cent parsing and validation', () => {
  test('parses a decimal dollar string into exact integer cents', () => {
    expect(parseCentsFromInput('12.34')).toBe(1234);
    expect(parseCentsFromInput('0.01')).toBe(1);
    expect(parseCentsFromInput('100')).toBe(10000);
  });

  test('rejects malformed, negative, zero, or non-finite amount strings', () => {
    for (const input of ['abc', '-5.00', '0', '0.00', 'NaN', 'Infinity', '1.234', '', '  ']) {
      expect(() => parseCentsFromInput(input)).toThrow();
    }
  });

  test('isSafeCents rejects unsafe, negative, non-integer values', () => {
    expect(isSafeCents(100)).toBe(true);
    expect(isSafeCents(0)).toBe(true);
    expect(isSafeCents(-1)).toBe(false);
    expect(isSafeCents(1.5)).toBe(false);
    expect(isSafeCents(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    expect(isSafeCents(Number.NaN)).toBe(false);
  });

  test('roundHalfUpCents applies half-up rounding for percentage adjustments', () => {
    expect(roundHalfUpCents(500000, 3)).toBe(515000);
    expect(roundHalfUpCents(100, 0.5)).toBe(101);
    expect(roundHalfUpCents(100, -0.5)).toBe(99);
  });

  test('formatCentsAsDollars is exact even near Number.MAX_SAFE_INTEGER (no float collisions)', () => {
    expect(formatCentsAsDollars(9007199254740991)).toBe('$90,071,992,547,409.91');
    expect(formatCentsAsDollars(9007199254740990)).toBe('$90,071,992,547,409.90');
    expect(formatCentsAsDollars(9007199254740991)).not.toBe(formatCentsAsDollars(9007199254740990));
  });

  test('parseCentsFromInput and roundHalfUpCents reject results outside the safe-integer range rather than silently wrapping', () => {
    expect(() => parseCentsFromInput('99999999999999999.99')).toThrow();
    expect(() => roundHalfUpCents(Number.MAX_SAFE_INTEGER, 50)).toThrow();
  });
});
