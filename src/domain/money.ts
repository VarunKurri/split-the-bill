/**
 * Money is integer cents everywhere. Floats are only ever a display concern.
 *
 * `0.1 + 0.2 !== 0.3` is not an abstract problem here: a bill with a few
 * shared plates and a percentage tip accumulates enough error to make the
 * per-person totals fail to add up to what the restaurant charged.
 */

const CURRENCY = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

/** `1234` -> `"$12.34"`. Negative values render as `-$0.03`. */
export function formatCents(cents: number): string {
  return CURRENCY.format(cents / 100);
}

/** `1234` -> `"12.34"`, for editable inputs where the affix is rendered separately. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Parse user input into cents. Tolerant of `$`, thousands separators and
 * whitespace; strict about everything else.
 *
 * Returns `null` for anything that isn't a non-negative number, so callers can
 * distinguish "empty / invalid" from "zero" and show the field's error state
 * rather than silently writing NaN into the bill.
 */
export function parseCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (cleaned === '') return null;
  if (!/^\d*\.?\d*$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** Parse a percentage such as `8.5` or `8.5%`. Returns `null` when unusable. */
export function parsePercent(input: string): number | null {
  const cleaned = input.replace(/[%\s]/g, '');
  if (cleaned === '') return null;
  if (!/^\d*\.?\d*$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return value;
}

/** Percentage of a cent amount, rounded to the nearest cent. */
export function percentOf(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100);
}

/**
 * Split `total` cents across `weights` proportionally, using the
 * largest-remainder (Hamilton) method.
 *
 * Guarantees the result sums to exactly `total` — no cent is created or lost.
 * The leftover cents go to the entries with the largest fractional remainders,
 * which is the allocation people intuitively agree is fairest, and ties break
 * by index so the result is deterministic across renders.
 *
 * Returns all zeros when the weights sum to zero (nothing to split against).
 */
export function allocate(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0) return new Array<number>(n).fill(0);

  const sign = total < 0 ? -1 : 1;
  const magnitude = Math.abs(total);

  const exact = weights.map((w) => (magnitude * w) / totalWeight);
  const floors = exact.map((value) => Math.floor(value));
  const distributed = floors.reduce((sum, value) => sum + value, 0);
  let remainder = magnitude - distributed;

  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);

  const result = [...floors];
  for (let i = 0; i < order.length && remainder > 0; i += 1) {
    result[order[i].index] += 1;
    remainder -= 1;
  }

  return sign === -1 ? result.map((value) => -value) : result;
}

/** Exact (unrounded) proportional share, used only to derive rounding deltas. */
export function exactShare(total: number, weight: number, totalWeight: number): number {
  if (totalWeight <= 0) return 0;
  return (total * weight) / totalWeight;
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
