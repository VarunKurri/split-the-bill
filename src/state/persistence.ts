import type { Bill, Charges, Item, Payment, Person, SplitMode } from '../domain/types';
import { DEFAULT_CHARGES, createEmptyBill } from './billReducer';

const STORAGE_KEY = 'split-the-bill:v1';

/**
 * The bill survives a refresh. Mid-dinner, on a phone, a lost bill is worse
 * than no app at all — and there is no backend to fall back on.
 */
export function loadBill(): Bill {
  if (typeof localStorage === 'undefined') return createEmptyBill();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyBill();
    return reviveBill(JSON.parse(raw));
  } catch {
    // Corrupt or foreign payload: start clean rather than crash on load.
    return createEmptyBill();
  }
}

export function saveBill(bill: Bill): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bill));
  } catch {
    // Private mode or a full quota. Persistence is a convenience, not a
    // requirement — the session keeps working without it.
  }
}

export function clearStoredBill(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Validate anything coming out of storage before trusting it. The engine is
 * defensive about stale references, but garbage in the shape of the state
 * (a string where cents should be, a missing array) should never reach it.
 */
function reviveBill(raw: unknown): Bill {
  if (!isRecord(raw)) return createEmptyBill();

  const people: Person[] = asArray(raw.people)
    .filter(isRecord)
    .map((p, index) => ({
      id: str(p.id) ?? `person_${index}`,
      name: str(p.name) ?? `Person ${index + 1}`,
      colorIndex: int(p.colorIndex) ?? (index % 8) + 1,
    }));

  const knownPeople = new Set(people.map((p) => p.id));

  const items: Item[] = asArray(raw.items)
    .filter(isRecord)
    .map((item, index) => {
      // Percent weights are fractional (33.33), so these must not be rounded
      // to integers the way cents are.
      const assignments = asArray(item.assignments)
        .filter(isRecord)
        .map((a) => ({ personId: str(a.personId) ?? '', weight: num(a.weight) ?? 1 }))
        .filter((a) => a.personId !== '' && knownPeople.has(a.personId) && a.weight > 0);

      return {
        id: str(item.id) ?? `item_${index}`,
        name: str(item.name) ?? 'Item',
        priceCents: int(item.priceCents) ?? 0,
        splitMode: reviveSplitMode(item.splitMode, assignments),
        assignments,
      };
    });

  const rawCharges = isRecord(raw.charges) ? raw.charges : {};
  const charges: Charges = {
    taxMode: rawCharges.taxMode === 'amount' ? 'amount' : 'percent',
    taxPercent: num(rawCharges.taxPercent) ?? DEFAULT_CHARGES.taxPercent,
    taxCents: int(rawCharges.taxCents) ?? 0,
    tipMode: rawCharges.tipMode === 'amount' ? 'amount' : 'percent',
    tipPercent: num(rawCharges.tipPercent) ?? DEFAULT_CHARGES.tipPercent,
    tipCents: int(rawCharges.tipCents) ?? 0,
    tipBasis: rawCharges.tipBasis === 'postTax' ? 'postTax' : 'preTax',
  };

  const payments: Payment[] = asArray(raw.payments)
    .filter(isRecord)
    .map((p) => ({ personId: str(p.personId) ?? '', amountCents: int(p.amountCents) ?? 0 }))
    .filter((p) => p.personId !== '' && knownPeople.has(p.personId) && p.amountCents > 0);

  return {
    name: str(raw.name) ?? 'Dinner',
    createdAt: str(raw.createdAt) ?? new Date().toISOString(),
    people,
    items,
    charges,
    payments,
    settledPersonIds: asArray(raw.settledPersonIds)
      .filter((id): id is string => typeof id === 'string')
      .filter((id) => knownPeople.has(id)),
  };
}

/**
 * Bills stored before split modes existed have no `splitMode`. Rather than
 * defaulting them all to `equal` — which would mislabel a 2:1 split as even —
 * infer it from the weights that are already there.
 */
function reviveSplitMode(value: unknown, assignments: { weight: number }[]): SplitMode {
  if (value === 'equal' || value === 'shares' || value === 'percent' || value === 'amount') {
    return value;
  }
  if (assignments.length === 0) return 'equal';
  const uneven = assignments.some((a) => a.weight !== assignments[0].weight);
  return uneven ? 'shares' : 'equal';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function int(value: unknown): number | null {
  const n = num(value);
  return n === null ? null : Math.round(n);
}
