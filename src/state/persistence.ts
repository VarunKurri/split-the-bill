import type { Bill, Charges, Item, Person } from '../domain/types';
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
    .map((item, index) => ({
      id: str(item.id) ?? `item_${index}`,
      name: str(item.name) ?? 'Item',
      priceCents: int(item.priceCents) ?? 0,
      assignments: asArray(item.assignments)
        .filter(isRecord)
        .map((a) => ({ personId: str(a.personId) ?? '', weight: int(a.weight) ?? 1 }))
        .filter((a) => a.personId !== '' && knownPeople.has(a.personId) && a.weight > 0),
    }));

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

  return {
    name: str(raw.name) ?? 'Dinner',
    createdAt: str(raw.createdAt) ?? new Date().toISOString(),
    people,
    items,
    charges,
    settledPersonIds: asArray(raw.settledPersonIds)
      .filter((id): id is string => typeof id === 'string')
      .filter((id) => knownPeople.has(id)),
  };
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
