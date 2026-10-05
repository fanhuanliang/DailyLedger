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

export function roundHalfUpCents(baseCents: number, percent: number | string): number {
  if (!Number.isSafeInteger(baseCents) || baseCents < 0) throw new Error('baseCents must be nonnegative safe integer cents.');
  if (typeof percent === 'number' && !Number.isFinite(percent)) throw new Error('percent must be finite.');
  const text = String(percent).trim();
  if (text.length > 128) throw new Error('Percentage is too long.');
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match) throw new Error('Percentage must be a decimal number.');
  const fraction = match[3] ?? '';
  const exponent = Number(match[4] ?? 0) - fraction.length;
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 256) throw new Error('Percentage precision is outside the supported range.');
  let numerator = BigInt(match[2]! + fraction) * (match[1] === '-' ? -1n : 1n);
  const scale = exponent < 0 ? 10n ** BigInt(-exponent) : 1n;
  if (exponent > 0) numerator *= 10n ** BigInt(exponent);
  const denominator = 100n * scale;
  const finalNumerator = BigInt(baseCents) * (denominator + numerator);
  if (finalNumerator < 0n) throw new Error('Adjusted amount must not be negative.');
  const rounded = (finalNumerator + denominator / 2n) / denominator;
  return toSafeNumber(rounded);
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
