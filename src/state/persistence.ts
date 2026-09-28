import type { Bill, Charges, Item, Payment, Person, SplitMode } from '../domain/types';
import { DEFAULT_CHARGES, createEmptyBill } from './billReducer';

const STORAGE_KEY = 'split-the-bill:v1';
const SCHEMA_VERSION = 1;
const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;

interface StoredBill {
  version: typeof SCHEMA_VERSION;
  bill: Bill;
}

export interface LoadBillResult {
  bill: Bill;
  warning: string | null;
}

/**
 * The bill survives a refresh. The result includes a warning because silently
 * replacing corrupt state with an empty bill looks exactly like data loss.
 */
export function loadBill(): LoadBillResult {
  if (typeof localStorage === 'undefined') return { bill: createEmptyBill(), warning: null };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { bill: createEmptyBill(), warning: null };

    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed) && 'version' in parsed && !isStoredBill(parsed)) {
      throw new Error('Unsupported bill version');
    }
    const payload = isStoredBill(parsed) ? parsed.bill : parsed;
    return { bill: reviveBill(payload), warning: null };
  } catch {
    return {
      bill: createEmptyBill(),
      warning: 'The saved bill could not be read, so a new bill was opened.',
    };
  }
}

export function saveBill(bill: Bill): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const stored: StoredBill = { version: SCHEMA_VERSION, bill };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

export function clearStoredBill(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate anything coming out of storage before trusting it. Values are
 * repaired conservatively so malformed local data cannot create negative bills,
 * impossible percentages, duplicate identities, or an invalid render date.
 */
function reviveBill(raw: unknown): Bill {
  if (!isRecord(raw)) throw new Error('Invalid bill');

  const seenPersonIds = new Set<string>();
  const people: Person[] = asArray(raw.people)
    .filter(isRecord)
    .map((person, index) => {
      const candidate = str(person.id);
      const id = uniqueId(candidate, 'person', index, seenPersonIds);
      seenPersonIds.add(id);
      return {
        id,
        name: str(person.name)?.trim() || `Person ${index + 1}`,
        colorIndex: boundedInt(person.colorIndex, 1, 8) ?? (index % 8) + 1,
      };
    });

  const knownPeople = new Set(people.map((person) => person.id));
  const seenItemIds = new Set<string>();
  const items: Item[] = asArray(raw.items)
    .filter(isRecord)
    .map((item, index) => {
      const candidate = str(item.id);
      const id = uniqueId(candidate, 'item', index, seenItemIds);
      seenItemIds.add(id);

      const seenAssignees = new Set<string>();
      const assignments = asArray(item.assignments)
        .filter(isRecord)
        .map((assignment) => ({
          personId: str(assignment.personId) ?? '',
          // Old payloads may omit weights and mean an equal split. A present
          // but invalid weight is different: drop it rather than reviving a
          // corrupt negative claim as a legitimate equal share. Explicit zero
          // entries are valid drafts and must remain editable after a refresh.
          weight: assignment.weight === undefined ? 1 : nonNegativeNumber(assignment.weight),
        }))
        .filter((assignment): assignment is { personId: string; weight: number } => {
          const valid =
            assignment.personId !== '' &&
            knownPeople.has(assignment.personId) &&
            !seenAssignees.has(assignment.personId) &&
            assignment.weight !== null;
          if (valid) seenAssignees.add(assignment.personId);
          return valid;
        });

      return {
        id,
        name: str(item.name)?.trim() || 'Item',
        priceCents: cents(item.priceCents) ?? 0,
        splitMode: reviveSplitMode(item.splitMode, assignments),
        assignments,
      };
    });

  const rawCharges = isRecord(raw.charges) ? raw.charges : {};
  const charges: Charges = {
    taxMode: rawCharges.taxMode === 'amount' ? 'amount' : 'percent',
    taxPercent: boundedNumber(rawCharges.taxPercent, 0, 100) ?? DEFAULT_CHARGES.taxPercent,
    taxCents: cents(rawCharges.taxCents) ?? 0,
    tipMode: rawCharges.tipMode === 'amount' ? 'amount' : 'percent',
    tipPercent: boundedNumber(rawCharges.tipPercent, 0, 100) ?? DEFAULT_CHARGES.tipPercent,
    tipCents: cents(rawCharges.tipCents) ?? 0,
    tipBasis: rawCharges.tipBasis === 'postTax' ? 'postTax' : 'preTax',
  };

  const payments: Payment[] = asArray(raw.payments)
    .filter(isRecord)
    .map((payment) => ({
      personId: str(payment.personId) ?? '',
      amountCents: cents(payment.amountCents) ?? 0,
    }))
    .filter(
      (payment) =>
        payment.personId !== '' && knownPeople.has(payment.personId) && payment.amountCents > 0,
    );

  return {
    name: str(raw.name)?.trim() || 'Dinner',
    createdAt: validDate(raw.createdAt) ?? new Date().toISOString(),
    people,
    items,
    charges,
    payments,
    settledPersonIds: [
      ...new Set(
        asArray(raw.settledPersonIds)
          .filter((id): id is string => typeof id === 'string')
          .filter((id) => knownPeople.has(id)),
      ),
    ],
  };
}

function isStoredBill(value: unknown): value is StoredBill {
  return isRecord(value) && value.version === SCHEMA_VERSION && 'bill' in value;
}

/** Bills stored before split modes existed infer the mode from their weights. */
function reviveSplitMode(value: unknown, assignments: { weight: number }[]): SplitMode {
  if (value === 'equal' || value === 'shares' || value === 'percent' || value === 'amount') {
    return value;
  }
  if (assignments.length === 0) return 'equal';
  return assignments.some((assignment) => assignment.weight !== assignments[0].weight)
    ? 'shares'
    : 'equal';
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

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function boundedNumber(value: unknown, min: number, max: number): number | null {
  const number = finiteNumber(value);
  return number !== null && number >= min && number <= max ? number : null;
}

function boundedInt(value: unknown, min: number, max: number): number | null {
  const number = boundedNumber(value, min, max);
  return number === null ? null : Math.round(number);
}

function cents(value: unknown): number | null {
  const number = boundedNumber(value, 0, MAX_SAFE_CENTS);
  return number === null ? null : Math.round(number);
}

function validDate(value: unknown): string | null {
  const date = str(value);
  return date && Number.isFinite(Date.parse(date)) ? date : null;
}

function uniqueId(
  candidate: string | null,
  prefix: string,
  index: number,
  seen: Set<string>,
): string {
  if (candidate && !seen.has(candidate)) return candidate;
  let suffix = index;
  while (seen.has(`${prefix}_${suffix}`)) suffix += 1;
  return `${prefix}_${suffix}`;
}
