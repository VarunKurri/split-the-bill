import { allocate } from '../domain/money';
import { wholeShareWeights } from '../domain/shareWeights';
import type {
  Assignment,
  Bill,
  Charges,
  ID,
  Item,
  Person,
  SplitMode,
  TipBasis,
} from '../domain/types';

/* ------------------------------------------------------------------ */
/* Initial state                                                       */
/* ------------------------------------------------------------------ */

export const DEFAULT_CHARGES: Charges = {
  taxMode: 'percent',
  taxPercent: 8.5,
  taxCents: 0,
  tipMode: 'percent',
  tipPercent: 20,
  tipCents: 0,
  tipBasis: 'preTax',
};

export function createEmptyBill(): Bill {
  return {
    name: 'Dinner',
    createdAt: new Date().toISOString(),
    people: [],
    items: [],
    charges: { ...DEFAULT_CHARGES },
    payments: [],
    settledPersonIds: [],
  };
}

/* ------------------------------------------------------------------ */
/* State shape                                                         */
/* ------------------------------------------------------------------ */

export interface UndoEntry {
  label: string;
  bill: Bill;
}

export interface BillState {
  bill: Bill;
  /**
   * One level of undo, offered only for actions that destroy work
   * (removing a person or an item, or clearing the bill). Deep enough to
   * make deletion feel safe; shallow enough to stay obvious.
   */
  undo: UndoEntry | null;
}

export type BillAction =
  | { type: 'bill/rename'; name: string }
  | { type: 'bill/reset' }
  | { type: 'person/add'; name: string }
  | { type: 'person/remove'; personId: ID }
  | { type: 'person/toggleSettled'; personId: ID }
  | { type: 'item/add'; name: string; priceCents: number; assignToAll?: boolean }
  | { type: 'item/update'; itemId: ID; name?: string; priceCents?: number }
  | { type: 'item/remove'; itemId: ID }
  | { type: 'item/toggleAssignee'; itemId: ID; personId: ID }
  | { type: 'item/setWeight'; itemId: ID; personId: ID; weight: number }
  | { type: 'item/setSplitMode'; itemId: ID; mode: SplitMode }
  | { type: 'item/setPercent'; itemId: ID; personId: ID; percent: number }
  | { type: 'item/setAmount'; itemId: ID; personId: ID; amountCents: number }
  | { type: 'item/assignAll'; itemId: ID }
  | { type: 'item/clearAssignees'; itemId: ID }
  | { type: 'charges/set'; patch: Partial<Charges> }
  | { type: 'charges/setTipBasis'; basis: TipBasis }
  | { type: 'payment/set'; personId: ID; amountCents: number }
  | { type: 'payment/clearAll' }
  | { type: 'undo' };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

let idCounter = 0;
/**
 * Ids only need to be unique within one bill in one browser. `crypto.randomUUID`
 * is used when available; the counter fallback keeps non-secure contexts and
 * the test environment working.
 */
function newId(prefix: string): ID {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

const PALETTE_SIZE = 8;

/**
 * Pick the lowest-numbered palette colour nobody is currently using, so
 * removing and re-adding people doesn't drift everyone's colour. Wraps once
 * the party outgrows the palette.
 */
function nextColorIndex(people: Person[]): number {
  const taken = new Set(people.map((p) => p.colorIndex));
  for (let i = 1; i <= PALETTE_SIZE; i += 1) {
    if (!taken.has(i)) return i;
  }
  return (people.length % PALETTE_SIZE) + 1;
}

/**
 * Two people called "Alex" is normal at a dinner table, so duplicates are
 * allowed rather than blocked — they're told apart by colour, and the second
 * one gets a numeric suffix so the summary is readable.
 */
function disambiguate(name: string, people: Person[]): string {
  const trimmed = name.trim();
  const existing = people.filter(
    (p) =>
      p.name.toLowerCase() === trimmed.toLowerCase() ||
      new RegExp(`^${escapeRegExp(trimmed)} \\d+$`, 'i').test(p.name),
  );
  return existing.length === 0 ? trimmed : `${trimmed} ${existing.length + 1}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Recast an item's weights into the shape a mode expects, so switching modes
 * never leaves a nonsense split behind.
 *
 * Percent seeding goes through `allocate` on 10000 basis points rather than
 * `100 / n`, which is the same largest-remainder rule the money itself uses —
 * three people get 33.34 / 33.33 / 33.33 and the column adds to exactly 100,
 * instead of 33.33 x 3 leaving a hundredth of a percent unaccounted for.
 */
function toMode(
  assignments: Assignment[],
  mode: SplitMode,
  priceCents: number,
): Assignment[] | null {
  if (assignments.length === 0) return assignments;

  // Unequal modes restate the weights in new units. Percentages and amounts
  // round to their supported precision; whole shares preserve the exact ratio.
  // Only choosing equal explicitly resets everyone to the same weight.
  const base = assignments.map((a) => a.weight);

  switch (mode) {
    case 'equal':
      return assignments.map((a) => ({ ...a, weight: 1 }));

    case 'shares': {
      const weights = wholeShareWeights(base);
      return weights && assignments.map((a, index) => ({ ...a, weight: weights[index] }));
    }

    case 'percent': {
      const points = allocate(10000, base);
      return assignments.map((a, index) => ({ ...a, weight: points[index] / 100 }));
    }

    case 'amount': {
      // A free item has nothing to hand out; converting would zero every weight
      // and drop the item into "nobody claimed this".
      if (priceCents === 0) {
        const weights = wholeShareWeights(base);
        return weights && assignments.map((a, index) => ({ ...a, weight: weights[index] }));
      }
      const cents = allocate(priceCents, base);
      return assignments.map((a, index) => ({ ...a, weight: cents[index] }));
    }
  }
}

/**
 * Restate a split after the people on it change. Only the modes whose weights
 * have to hit a target need it; `equal` and `shares` are already relative.
 */
function reseed(assignments: Assignment[], mode: SplitMode, priceCents: number): Assignment[] {
  return mode === 'percent' || mode === 'amount'
    ? (toMode(assignments, mode, priceCents) ?? assignments)
    : assignments;
}

function mapItem(bill: Bill, itemId: ID, fn: (item: Item) => Item): Bill {
  return { ...bill, items: bill.items.map((item) => (item.id === itemId ? fn(item) : item)) };
}

function withUndo(state: BillState, label: string, bill: Bill): BillState {
  return { bill, undo: { label, bill: state.bill } };
}

function commit(bill: Bill): BillState {
  return { bill, undo: null };
}

function isCents(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/** These editors round and clamp finite input, but must never store NaN or infinity. */
function isRoundable(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
}

function validCharges(charges: Charges): boolean {
  return (
    (charges.taxMode === 'percent' || charges.taxMode === 'amount') &&
    (charges.tipMode === 'percent' || charges.tipMode === 'amount') &&
    (charges.tipBasis === 'preTax' || charges.tipBasis === 'postTax') &&
    isCents(charges.taxCents) &&
    isCents(charges.tipCents) &&
    Number.isFinite(charges.taxPercent) &&
    charges.taxPercent >= 0 &&
    charges.taxPercent <= 100 &&
    Number.isFinite(charges.tipPercent) &&
    charges.tipPercent >= 0 &&
    charges.tipPercent <= 100
  );
}

/* ------------------------------------------------------------------ */
/* Reducer                                                             */
/* ------------------------------------------------------------------ */

export function billReducer(state: BillState, action: BillAction): BillState {
  const { bill } = state;

  // A late edit from a removed row must not create dangling references or
  // consume the undo that would bring that row back.
  if ('personId' in action && !bill.people.some((person) => person.id === action.personId)) {
    return state;
  }
  if ('itemId' in action) {
    const item = bill.items.find((candidate) => candidate.id === action.itemId);
    if (!item) return state;
    if (
      (action.type === 'item/setWeight' ||
        action.type === 'item/setPercent' ||
        action.type === 'item/setAmount') &&
      !item.assignments.some((assignment) => assignment.personId === action.personId)
    ) {
      return state;
    }
  }

  switch (action.type) {
    case 'bill/rename':
      return { ...state, bill: { ...bill, name: action.name } };

    case 'bill/reset':
      return withUndo(state, 'Bill cleared', createEmptyBill());

    /* ---- People ---- */

    case 'person/add': {
      const name = action.name.trim();
      if (!name) return state;
      const person: Person = {
        id: newId('person'),
        name: disambiguate(name, bill.people),
        colorIndex: nextColorIndex(bill.people),
      };
      return commit({ ...bill, people: [...bill.people, person] });
    }

    case 'person/remove': {
      // Their assignments go with them. Any item left with no claimants
      // reverts to unassigned rather than being deleted or silently
      // reassigned — and the whole thing is undoable.
      const next: Bill = {
        ...bill,
        people: bill.people.filter((p) => p.id !== action.personId),
        items: bill.items.map((item) => ({
          ...item,
          assignments: item.assignments.filter((a) => a.personId !== action.personId),
        })),
        payments: bill.payments.filter((p) => p.personId !== action.personId),
        settledPersonIds: bill.settledPersonIds.filter((id) => id !== action.personId),
      };
      const removed = bill.people.find((p) => p.id === action.personId);
      return withUndo(state, `Removed ${removed?.name ?? 'person'}`, next);
    }

    case 'person/toggleSettled': {
      const settled = bill.settledPersonIds.includes(action.personId)
        ? bill.settledPersonIds.filter((id) => id !== action.personId)
        : [...bill.settledPersonIds, action.personId];
      return commit({ ...bill, settledPersonIds: settled });
    }

    /* ---- Items ---- */

    case 'item/add': {
      const name = action.name.trim();
      if (!name || !isCents(action.priceCents)) return state;
      const item: Item = {
        id: newId('item'),
        name,
        priceCents: action.priceCents,
        splitMode: 'equal',
        assignments: action.assignToAll
          ? bill.people.map((p) => ({ personId: p.id, weight: 1 }))
          : [],
      };
      return commit({ ...bill, items: [...bill.items, item] });
    }

    case 'item/update':
      if (action.priceCents !== undefined && !isCents(action.priceCents)) return state;
      return commit(
        mapItem(bill, action.itemId, (item) => ({
          ...item,
          name: action.name?.trim() || item.name,
          priceCents: action.priceCents ?? item.priceCents,
        })),
      );

    case 'item/remove': {
      const removed = bill.items.find((i) => i.id === action.itemId);
      const next: Bill = { ...bill, items: bill.items.filter((i) => i.id !== action.itemId) };
      return withUndo(state, `Removed ${removed?.name ?? 'item'}`, next);
    }

    case 'item/toggleAssignee':
      return commit(
        mapItem(bill, action.itemId, (item) => {
          const claimed = item.assignments.some((a) => a.personId === action.personId);
          const next = claimed
            ? item.assignments.filter((a) => a.personId !== action.personId)
            : [...item.assignments, { personId: action.personId, weight: 1 }];
          // Percentages and amounts have to add back up to their target after
          // the party changes, so they get restated. Shares don't need it —
          // they're relative, and 2:1 still means 2:1 with one fewer person.
          return { ...item, assignments: reseed(next, item.splitMode, item.priceCents) };
        }),
      );

    case 'item/setWeight': {
      if (!isRoundable(action.weight)) return state;
      const weight = Math.max(1, Math.round(action.weight));
      return commit(
        mapItem(bill, action.itemId, (item) => ({
          ...item,
          assignments: item.assignments.map((a) =>
            a.personId === action.personId ? { ...a, weight } : a,
          ),
        })),
      );
    }

    case 'item/setSplitMode': {
      const item = bill.items.find((candidate) => candidate.id === action.itemId);
      if (!item || item.splitMode === action.mode) return state;
      const assignments = toMode(item.assignments, action.mode, item.priceCents);
      if (!assignments) return state;
      return commit(
        mapItem(bill, item.id, () => ({ ...item, splitMode: action.mode, assignments })),
      );
    }

    case 'item/setPercent': {
      if (!Number.isFinite(action.percent)) return state;
      // Clamped but deliberately not normalised: forcing the other rows to
      // rebalance as you type makes the control fight you. The tray shows the
      // running total instead, and the split stays proportional either way.
      const percent = Math.round(Math.min(100, Math.max(0, action.percent)) * 100) / 100;
      return commit(
        mapItem(bill, action.itemId, (item) => ({
          ...item,
          assignments: item.assignments.map((a) =>
            a.personId === action.personId ? { ...a, weight: percent } : a,
          ),
        })),
      );
    }

    case 'item/setAmount': {
      if (!isRoundable(action.amountCents)) return state;
      // Like percentages, deliberately not normalised as you type — the tray
      // reports what is left to assign instead of shuffling the other rows.
      const amountCents = Math.max(0, Math.round(action.amountCents));
      return commit(
        mapItem(bill, action.itemId, (item) => ({
          ...item,
          assignments: item.assignments.map((a) =>
            a.personId === action.personId ? { ...a, weight: amountCents } : a,
          ),
        })),
      );
    }

    case 'item/assignAll':
      return commit(
        mapItem(bill, action.itemId, (item) => {
          const next = bill.people.map((p) => {
            const existing = item.assignments.find((a) => a.personId === p.id);
            return { personId: p.id, weight: existing?.weight ?? 1 };
          });
          // Everyone explicitly assigns the item, even if all selected entries
          // were zero. Merely changing modes must not revive zero claims.
          const claims = next.some((a) => a.weight > 0)
            ? next
            : next.map((a) => ({ ...a, weight: 1 }));
          return { ...item, assignments: reseed(claims, item.splitMode, item.priceCents) };
        }),
      );

    case 'item/clearAssignees':
      return commit(mapItem(bill, action.itemId, (item) => ({ ...item, assignments: [] })));

    /* ---- Charges ---- */

    case 'charges/set': {
      const charges = { ...bill.charges, ...action.patch };
      // Validate the whole patch before committing any of it: accepting a
      // mode switch while dropping its invalid amount would change the bill.
      return validCharges(charges) ? commit({ ...bill, charges }) : state;
    }

    case 'charges/setTipBasis':
      if (action.basis !== 'preTax' && action.basis !== 'postTax') return state;
      return commit({ ...bill, charges: { ...bill.charges, tipBasis: action.basis } });

    /* ---- Payments ---- */

    case 'payment/set': {
      if (!isRoundable(action.amountCents)) return state;
      // One row per person, so paying is idempotent: setting an amount
      // replaces what was there rather than stacking a second payment.
      const amountCents = Math.max(0, Math.round(action.amountCents));
      const others = bill.payments.filter((p) => p.personId !== action.personId);
      return commit({
        ...bill,
        payments:
          amountCents === 0 ? others : [...others, { personId: action.personId, amountCents }],
      });
    }

    case 'payment/clearAll':
      return bill.payments.length === 0
        ? state
        : withUndo(state, 'Payments cleared', { ...bill, payments: [] });

    /* ---- Undo ---- */

    case 'undo':
      return state.undo ? commit(state.undo.bill) : state;

    default:
      return state;
  }
}
