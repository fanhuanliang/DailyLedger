const DECIMAL_INPUT = /^\d+\.\d{2}$|^\d+$/;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function toSafeNumber(value: bigint): number {
  if (value < 0n || value > MAX_SAFE) throw new Error('Amount is outside the safe integer-cent range.');
  return Number(value);
}

export function parseAmountInput(input: string): number {
  const trimmed = input.trim();
  if (!DECIMAL_INPUT.test(trimmed)) throw new Error('Enter a positive amount with at most two decimal places.');
  const [whole = '0', fraction = '00'] = trimmed.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction);
  if (cents <= 0n) throw new Error('Enter a positive amount with at most two decimal places.');
  return toSafeNumber(cents);
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

export function centsToAmountInputValue(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error('Amount is outside the safe integer-cent range.');
  const abs = BigInt(Math.abs(cents));
  const dollars = abs / 100n;
  const remainder = (abs % 100n).toString().padStart(2, '0');
  return `${dollars.toString()}.${remainder}`;
}

export function parseOpeningBalanceInput(input: string): number {
  const trimmed = input.trim();
  if (!/^-?\d+(?:\.\d{2})?$/.test(trimmed)) throw new Error('Enter a signed balance with two decimal places.');
  const negative = trimmed.startsWith('-');
  const [whole = '0', fraction = '00'] = (negative ? trimmed.slice(1) : trimmed).split('.');
  const amount = BigInt(whole) * 100n + BigInt(fraction);
  if (amount > MAX_SAFE) throw new Error('Amount is outside the safe integer-cent range.');
  return Number(negative ? -amount : amount);
}
