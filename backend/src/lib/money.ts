const DECIMAL_INPUT = /^\d+\.\d{2}$|^\d+$/;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function toSafeNumber(value: bigint): number {
  if (value < 0n || value > MAX_SAFE) throw new Error('Amount is outside the safe integer-cent range.');
  return Number(value);
}

export function parseCentsFromInput(input: string): number {
  const trimmed = input.trim();
  if (!DECIMAL_INPUT.test(trimmed)) throw new Error('Amount must be a positive number with at most two decimal places.');
  const [whole = '0', fraction = '00'] = trimmed.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction);
  if (cents <= 0n) throw new Error('Amount must be a positive number of cents.');
  return toSafeNumber(cents);
}

export function isSafeCents(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function roundHalfUpCents(baseCents: number, percent: number): number {
  if (!Number.isSafeInteger(baseCents)) throw new Error('baseCents must be a safe integer.');
  if (!Number.isFinite(percent)) throw new Error('percent must be a finite number.');
  // Exact arithmetic: represent percent as an integer numerator over a fixed denominator
  // so no floating-point multiplication or division touches the cent amount.
  const PERCENT_SCALE = 1_000_000n;
  const percentScaled = BigInt(Math.round(percent * 1_000_000));
  const numerator = BigInt(baseCents) * percentScaled;
  const denominator = PERCENT_SCALE * 100n;
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const halfUp = (remainder * 2n >= denominator && numerator >= 0n) || (remainder * 2n <= -denominator && numerator < 0n);
  const delta = halfUp ? quotient + (numerator >= 0n ? 1n : -1n) : quotient;
  return toSafeNumber(BigInt(baseCents) + delta);
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatCentsAsDollars(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error('Amount is outside the safe integer-cent range.');
  const sign = cents < 0 ? '-' : '';
  const abs = BigInt(Math.abs(cents));
  const dollars = abs / 100n;
  const remainder = (abs % 100n).toString().padStart(2, '0');
  return `${sign}$${groupThousands(dollars.toString())}.${remainder}`;
}
