import type { Bill, Charges, ID, Item, Person, TipBasis } from '../domain/types';

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
  | { type: 'person/rename'; personId: ID; name: string }
  | { type: 'person/remove'; personId: ID }
  | { type: 'person/toggleSettled'; personId: ID }
  | { type: 'item/add'; name: string; priceCents: number; assignToAll?: boolean }
  | { type: 'item/update'; itemId: ID; name?: string; priceCents?: number }
  | { type: 'item/remove'; itemId: ID }
  | { type: 'item/toggleAssignee'; itemId: ID; personId: ID }
  | { type: 'item/setWeight'; itemId: ID; personId: ID; weight: number }
  | { type: 'item/assignAll'; itemId: ID }
  | { type: 'item/clearAssignees'; itemId: ID }
  | { type: 'charges/set'; patch: Partial<Charges> }
  | { type: 'charges/setTipBasis'; basis: TipBasis }
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
    (p) => p.name.toLowerCase() === trimmed.toLowerCase() ||
      new RegExp(`^${escapeRegExp(trimmed)} \\d+$`, 'i').test(p.name),
  );
  return existing.length === 0 ? trimmed : `${trimmed} ${existing.length + 1}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

/* ------------------------------------------------------------------ */
/* Reducer                                                             */
/* ------------------------------------------------------------------ */

export function billReducer(state: BillState, action: BillAction): BillState {
  const { bill } = state;

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

    case 'person/rename': {
      const name = action.name.trim();
      if (!name) return state;
      return commit({
        ...bill,
        people: bill.people.map((p) => (p.id === action.personId ? { ...p, name } : p)),
      });
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
      if (!name) return state;
      const item: Item = {
        id: newId('item'),
        name,
        priceCents: action.priceCents,
        assignments: action.assignToAll
          ? bill.people.map((p) => ({ personId: p.id, weight: 1 }))
          : [],
      };
      return commit({ ...bill, items: [...bill.items, item] });
    }

    case 'item/update':
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
          return {
            ...item,
            assignments: claimed
              ? item.assignments.filter((a) => a.personId !== action.personId)
              : [...item.assignments, { personId: action.personId, weight: 1 }],
          };
        }),
      );

    case 'item/setWeight': {
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

    case 'item/assignAll':
      return commit(
        mapItem(bill, action.itemId, (item) => ({
          ...item,
          assignments: bill.people.map((p) => {
            const existing = item.assignments.find((a) => a.personId === p.id);
            return { personId: p.id, weight: existing?.weight ?? 1 };
          }),
        })),
      );

    case 'item/clearAssignees':
      return commit(mapItem(bill, action.itemId, (item) => ({ ...item, assignments: [] })));

    /* ---- Charges ---- */

    case 'charges/set':
      return commit({ ...bill, charges: { ...bill.charges, ...action.patch } });

    case 'charges/setTipBasis':
      return commit({ ...bill, charges: { ...bill.charges, tipBasis: action.basis } });

    /* ---- Undo ---- */

    case 'undo':
      return state.undo ? commit(state.undo.bill) : state;

    default:
      return state;
  }
}
