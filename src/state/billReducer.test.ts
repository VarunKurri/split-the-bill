import { describe, expect, it } from 'vitest';
import { billReducer, createEmptyBill, type BillAction, type BillState } from './billReducer';
import { calculateSplit } from '../domain/split';
import type { SplitMode } from '../domain/types';

function fresh(): BillState {
  return { bill: createEmptyBill(), undo: null };
}

function run(state: BillState, ...actions: BillAction[]): BillState {
  return actions.reduce(billReducer, state);
}

describe('people', () => {
  it('assigns each person the lowest free palette colour', () => {
    const state = run(
      fresh(),
      { type: 'person/add', name: 'Alex' },
      { type: 'person/add', name: 'Bri' },
    );
    expect(state.bill.people.map((p) => p.colorIndex)).toEqual([1, 2]);
  });

  it('reuses a freed colour rather than drifting the whole party', () => {
    let state = run(
      fresh(),
      { type: 'person/add', name: 'Alex' },
      { type: 'person/add', name: 'Bri' },
      { type: 'person/add', name: 'Chidi' },
    );
    const bri = state.bill.people[1];
    state = run(state, { type: 'person/remove', personId: bri.id });
    state = run(state, { type: 'person/add', name: 'Dana' });

    expect(state.bill.people.map((p) => p.name)).toEqual(['Alex', 'Chidi', 'Dana']);
    expect(state.bill.people.map((p) => p.colorIndex)).toEqual([1, 3, 2]);
  });

  it('allows duplicate names but disambiguates them', () => {
    const state = run(
      fresh(),
      { type: 'person/add', name: 'Alex' },
      { type: 'person/add', name: 'Alex' },
      { type: 'person/add', name: 'alex' },
    );
    expect(state.bill.people.map((p) => p.name)).toEqual(['Alex', 'Alex 2', 'alex 3']);
  });

  it('ignores an empty name', () => {
    const state = run(fresh(), { type: 'person/add', name: '   ' });
    expect(state.bill.people).toHaveLength(0);
  });
});

describe('removing a person', () => {
  it('reverts their items to unassigned instead of deleting them', () => {
    let state = run(
      fresh(),
      { type: 'person/add', name: 'Alex' },
      { type: 'item/add', name: 'Steak', priceCents: 4200, assignToAll: true },
    );
    const alex = state.bill.people[0];
    expect(state.bill.items[0].assignments).toHaveLength(1);

    state = run(state, { type: 'person/remove', personId: alex.id });

    expect(state.bill.items).toHaveLength(1);
    expect(state.bill.items[0].assignments).toEqual([]);
  });

  it('is undoable', () => {
    let state = run(
      fresh(),
      { type: 'person/add', name: 'Alex' },
      { type: 'item/add', name: 'Steak', priceCents: 4200, assignToAll: true },
    );
    const before = state.bill;
    state = run(state, { type: 'person/remove', personId: state.bill.people[0].id });

    expect(state.undo?.label).toBe('Removed Alex');
    state = run(state, { type: 'undo' });

    expect(state.bill).toEqual(before);
    expect(state.undo).toBeNull();
  });
});

describe('assignment', () => {
  it('toggles a person on and off an item', () => {
    let state = run(
      fresh(),
      { type: 'person/add', name: 'Alex' },
      { type: 'item/add', name: 'Burrata', priceCents: 1700 },
    );
    const personId = state.bill.people[0].id;
    const itemId = state.bill.items[0].id;

    state = run(state, { type: 'item/toggleAssignee', itemId, personId });
    expect(state.bill.items[0].assignments).toEqual([{ personId, weight: 1 }]);

    state = run(state, { type: 'item/toggleAssignee', itemId, personId });
    expect(state.bill.items[0].assignments).toEqual([]);
  });

  it('assigns everyone at once, preserving existing weights', () => {
    let state = run(
      fresh(),
      { type: 'person/add', name: 'Alex' },
      { type: 'person/add', name: 'Bri' },
      { type: 'item/add', name: 'Whole fish', priceCents: 6000 },
    );
    const [alex, bri] = state.bill.people;
    const itemId = state.bill.items[0].id;

    state = run(
      state,
      { type: 'item/toggleAssignee', itemId, personId: alex.id },
      { type: 'item/setWeight', itemId, personId: alex.id, weight: 3 },
      { type: 'item/assignAll', itemId },
    );

    expect(state.bill.items[0].assignments).toEqual([
      { personId: alex.id, weight: 3 },
      { personId: bri.id, weight: 1 },
    ]);
  });

  it('clamps share weights to at least one', () => {
    let state = run(
      fresh(),
      { type: 'person/add', name: 'Alex' },
      { type: 'item/add', name: 'Burrata', priceCents: 1700, assignToAll: true },
    );
    const itemId = state.bill.items[0].id;
    const personId = state.bill.people[0].id;

    state = run(state, { type: 'item/setWeight', itemId, personId, weight: 0 });
    expect(state.bill.items[0].assignments[0].weight).toBe(1);

    state = run(state, { type: 'item/setWeight', itemId, personId, weight: -4 });
    expect(state.bill.items[0].assignments[0].weight).toBe(1);
  });
});

describe('split modes', () => {
  function withSharedItem() {
    let state = run(
      fresh(),
      { type: 'person/add', name: 'Alex' },
      { type: 'person/add', name: 'Bri' },
      { type: 'person/add', name: 'Chidi' },
    );
    state = run(state, { type: 'item/add', name: 'Fish', priceCents: 3000, assignToAll: true });
    return state;
  }

  it('starts new items splitting equally', () => {
    const state = withSharedItem();
    expect(state.bill.items[0].splitMode).toBe('equal');
    expect(state.bill.items[0].assignments.map((a) => a.weight)).toEqual([1, 1, 1]);
  });

  it('ignores a mode change aimed at an item that does not exist', () => {
    const state = run(withSharedItem(), {
      type: 'item/setSplitMode',
      itemId: 'no-such-item',
      mode: 'percent',
    });
    expect(state.bill.items[0].splitMode).toBe('equal');
  });

  it('distributes the odd hundredth when seeding three-way percentages', () => {
    let state = withSharedItem();
    const itemId = state.bill.items[0].id;
    state = run(state, { type: 'item/setSplitMode', itemId, mode: 'percent' });

    const weights = state.bill.items[0].assignments.map((a) => a.weight);
    expect(weights).toEqual([33.34, 33.33, 33.33]);
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
  });

  it('pins every weight to 1 when switching back to equal', () => {
    let state = withSharedItem();
    const itemId = state.bill.items[0].id;
    const personId = state.bill.people[0].id;

    state = run(
      state,
      { type: 'item/setSplitMode', itemId, mode: 'shares' },
      { type: 'item/setWeight', itemId, personId, weight: 5 },
      { type: 'item/setSplitMode', itemId, mode: 'equal' },
    );
    expect(state.bill.items[0].assignments.map((a) => a.weight)).toEqual([1, 1, 1]);
  });

  it('preserves fractional percentage ratios as whole shares', () => {
    let state = withSharedItem();
    const itemId = state.bill.items[0].id;

    state = run(
      state,
      { type: 'item/setSplitMode', itemId, mode: 'percent' },
      { type: 'item/setSplitMode', itemId, mode: 'shares' },
    );
    expect(state.bill.items[0].assignments.every((a) => Number.isInteger(a.weight))).toBe(true);
    expect(state.bill.items[0].assignments.every((a) => a.weight >= 1)).toBe(true);
    expect(state.bill.items[0].assignments.map((a) => a.weight)).toEqual([3334, 3333, 3333]);
  });

  it.each([
    { mode: 'percent' as const, weights: [50, 30, 20], expected: [5, 3, 2] },
    { mode: 'percent' as const, weights: [12.5, 37.5, 50], expected: [1, 3, 4] },
    { mode: 'amount' as const, weights: [1500, 900, 600], expected: [5, 3, 2] },
    { mode: 'amount' as const, weights: [750, 2250, 0], expected: [1, 3, 0] },
  ])(
    'preserves the ratio and amounts owed when converting $weights from $mode to shares',
    ({ mode, weights, expected }) => {
      let state = withSharedItem();
      const itemId = state.bill.items[0].id;
      state = run(state, { type: 'item/setSplitMode', itemId, mode });
      state.bill.people.forEach((person, i) => {
        state = run(
          state,
          mode === 'percent'
            ? { type: 'item/setPercent', itemId, personId: person.id, percent: weights[i] }
            : { type: 'item/setAmount', itemId, personId: person.id, amountCents: weights[i] },
        );
      });
      const before = calculateSplit(state.bill);
      state = run(state, { type: 'item/setSplitMode', itemId, mode: 'shares' });
      expect(state.bill.items[0].assignments.map((a) => a.weight)).toEqual(expected);
      expect(calculateSplit(state.bill).perPerson.map((p) => p.totalCents)).toEqual(
        before.perPerson.map((p) => p.totalCents),
      );
      expect(calculateSplit(state.bill).reconciles).toBe(true);
    },
  );

  it('leaves all-zero claims unassigned when changing between unequal split modes', () => {
    let state = withSharedItem();
    const itemId = state.bill.items[0].id;
    state = run(state, { type: 'item/setSplitMode', itemId, mode: 'percent' });
    for (const person of state.bill.people)
      state = run(state, { type: 'item/setPercent', itemId, personId: person.id, percent: 0 });
    for (const mode of ['shares', 'amount', 'percent'] satisfies SplitMode[]) {
      state = run(state, { type: 'item/setSplitMode', itemId, mode });
      expect(state.bill.items[0].assignments.map((a) => a.weight)).toEqual([0, 0, 0]);
      expect(calculateSplit(state.bill).unassignedCents).toBe(3000);
    }
    // Everyone remains an explicit recovery action for an all-zero draft.
    state = run(state, { type: 'item/assignAll', itemId });
    expect(calculateSplit(state.bill).unassignedCents).toBe(0);
    expect(state.bill.items[0].assignments.map((a) => a.weight)).toEqual([33.34, 33.33, 33.33]);
  });

  it('leaves entries and undo intact when the selected mode is clicked again', () => {
    let state = withSharedItem();
    const itemId = state.bill.items[0].id;
    state = run(
      state,
      { type: 'item/setSplitMode', itemId, mode: 'percent' },
      ...state.bill.people.map((person) => ({
        type: 'item/setPercent' as const,
        itemId,
        personId: person.id,
        percent: 40,
      })),
      { type: 'item/add', name: 'Extra', priceCents: 100 },
    );
    state = run(state, { type: 'item/remove', itemId: state.bill.items[1].id });
    expect(billReducer(state, { type: 'item/setSplitMode', itemId, mode: 'percent' })).toBe(state);
  });

  it('leaves an unrepresentable legacy ratio and undo unchanged', () => {
    let state = withSharedItem();
    const itemId = state.bill.items[0].id;
    state = run(state, { type: 'item/add', name: 'Extra', priceCents: 100 });
    state = run(state, { type: 'item/remove', itemId: state.bill.items[1].id });
    state = {
      ...state,
      bill: {
        ...state.bill,
        items: [
          {
            ...state.bill.items[0],
            splitMode: 'percent',
            assignments: state.bill.items[0].assignments.map((a, index) => ({
              ...a,
              weight: [1, 1e20, 0][index],
            })),
          },
        ],
      },
    };
    expect(billReducer(state, { type: 'item/setSplitMode', itemId, mode: 'shares' })).toBe(state);
  });

  it('preserves zero claims and ratios when converting a free item to amount mode', () => {
    let state = withSharedItem();
    const itemId = state.bill.items[0].id;
    state = run(
      state,
      { type: 'item/update', itemId, priceCents: 0 },
      { type: 'item/setSplitMode', itemId, mode: 'percent' },
    );
    [75, 25, 0].forEach((percent, i) => {
      state = run(state, {
        type: 'item/setPercent',
        itemId,
        personId: state.bill.people[i].id,
        percent,
      });
    });
    state = run(state, { type: 'item/setSplitMode', itemId, mode: 'amount' });
    expect(state.bill.items[0].assignments.map((a) => a.weight)).toEqual([3, 1, 0]);
  });

  it('clamps a percentage to 0-100 and keeps two decimals', () => {
    let state = withSharedItem();
    const itemId = state.bill.items[0].id;
    const personId = state.bill.people[0].id;
    state = run(state, { type: 'item/setSplitMode', itemId, mode: 'percent' });

    state = run(state, { type: 'item/setPercent', itemId, personId, percent: 150 });
    expect(state.bill.items[0].assignments[0].weight).toBe(100);

    state = run(state, { type: 'item/setPercent', itemId, personId, percent: -10 });
    expect(state.bill.items[0].assignments[0].weight).toBe(0);

    state = run(state, { type: 'item/setPercent', itemId, personId, percent: 33.336 });
    expect(state.bill.items[0].assignments[0].weight).toBe(33.34);
  });

  it('does not rebalance the other rows as you type a percentage', () => {
    let state = withSharedItem();
    const itemId = state.bill.items[0].id;
    state = run(state, { type: 'item/setSplitMode', itemId, mode: 'percent' });

    state = run(state, {
      type: 'item/setPercent',
      itemId,
      personId: state.bill.people[0].id,
      percent: 50,
    });
    expect(state.bill.items[0].assignments.map((a) => a.weight)).toEqual([50, 33.33, 33.33]);
  });

  it('re-seeds percentages back to 100 when the party on the item changes', () => {
    let state = withSharedItem();
    const itemId = state.bill.items[0].id;
    state = run(state, { type: 'item/setSplitMode', itemId, mode: 'percent' });

    state = run(state, {
      type: 'item/toggleAssignee',
      itemId,
      personId: state.bill.people[2].id,
    });

    const weights = state.bill.items[0].assignments.map((a) => a.weight);
    expect(weights).toHaveLength(2);
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
  });

  it('keeps the remaining people’s relative shares when someone leaves the item', () => {
    let state = withSharedItem();
    const itemId = state.bill.items[0].id;
    const [alex, bri, chidi] = state.bill.people;

    state = run(
      state,
      { type: 'item/setSplitMode', itemId, mode: 'percent' },
      { type: 'item/setPercent', itemId, personId: alex.id, percent: 60 },
      { type: 'item/setPercent', itemId, personId: bri.id, percent: 30 },
      { type: 'item/setPercent', itemId, personId: chidi.id, percent: 10 },
      { type: 'item/toggleAssignee', itemId, personId: chidi.id },
    );

    // Alex had twice Bri's share before, so he still does — dropping the third
    // person must not quietly reset the two who are left to 50/50.
    expect(state.bill.items[0].assignments.map((a) => a.weight)).toEqual([66.67, 33.33]);
  });
});

describe('splitting by amount', () => {
  function withSharedItem(priceCents = 3000) {
    let state = run(
      fresh(),
      { type: 'person/add', name: 'Alex' },
      { type: 'person/add', name: 'Bri' },
      { type: 'person/add', name: 'Chidi' },
    );
    state = run(state, { type: 'item/add', name: 'Fish', priceCents, assignToAll: true });
    return state;
  }

  it('seeds amounts that add up to exactly the item price', () => {
    let state = withSharedItem(1000);
    const itemId = state.bill.items[0].id;
    state = run(state, { type: 'item/setSplitMode', itemId, mode: 'amount' });

    const weights = state.bill.items[0].assignments.map((a) => a.weight);
    expect(weights).toEqual([334, 333, 333]);
    expect(weights.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('carries the split over from percentages rather than resetting it', () => {
    let state = withSharedItem(3000);
    const itemId = state.bill.items[0].id;
    const [alex, bri, chidi] = state.bill.people;

    state = run(
      state,
      { type: 'item/setSplitMode', itemId, mode: 'percent' },
      { type: 'item/setPercent', itemId, personId: alex.id, percent: 50 },
      { type: 'item/setPercent', itemId, personId: bri.id, percent: 30 },
      { type: 'item/setPercent', itemId, personId: chidi.id, percent: 20 },
      { type: 'item/setSplitMode', itemId, mode: 'amount' },
    );

    expect(state.bill.items[0].assignments.map((a) => a.weight)).toEqual([1500, 900, 600]);
  });

  it('turns amounts back into readable whole shares', () => {
    let state = withSharedItem(3000);
    const itemId = state.bill.items[0].id;
    const [alex, bri, chidi] = state.bill.people;

    state = run(
      state,
      { type: 'item/setSplitMode', itemId, mode: 'amount' },
      { type: 'item/setAmount', itemId, personId: alex.id, amountCents: 1500 },
      { type: 'item/setAmount', itemId, personId: bri.id, amountCents: 1000 },
      { type: 'item/setAmount', itemId, personId: chidi.id, amountCents: 500 },
      { type: 'item/setSplitMode', itemId, mode: 'shares' },
    );

    // $15 / $10 / $5 is 3:2:1, not 1500:1000:500.
    expect(state.bill.items[0].assignments.map((a) => a.weight)).toEqual([3, 2, 1]);
  });

  it('never records a negative amount', () => {
    let state = withSharedItem();
    const itemId = state.bill.items[0].id;
    const personId = state.bill.people[0].id;

    state = run(
      state,
      { type: 'item/setSplitMode', itemId, mode: 'amount' },
      { type: 'item/setAmount', itemId, personId, amountCents: -500 },
    );
    expect(state.bill.items[0].assignments[0].weight).toBe(0);
  });

  it('leaves a free item claimed rather than zeroing everyone out', () => {
    let state = withSharedItem(0);
    const itemId = state.bill.items[0].id;
    state = run(state, { type: 'item/setSplitMode', itemId, mode: 'amount' });

    // Every weight would otherwise be 0, which reads as "nobody claimed this".
    expect(state.bill.items[0].assignments.every((a) => a.weight > 0)).toBe(true);
  });

  it('leaves share weights alone when the party changes', () => {
    let state = withSharedItem();
    const itemId = state.bill.items[0].id;

    state = run(
      state,
      { type: 'item/setSplitMode', itemId, mode: 'shares' },
      { type: 'item/setWeight', itemId, personId: state.bill.people[0].id, weight: 3 },
      { type: 'item/toggleAssignee', itemId, personId: state.bill.people[2].id },
    );
    // 3:1 still means 3:1 with one fewer person on the plate.
    expect(state.bill.items[0].assignments.map((a) => a.weight)).toEqual([3, 1]);
  });
});

describe('payments', () => {
  function withPeople() {
    return run(fresh(), { type: 'person/add', name: 'Alex' }, { type: 'person/add', name: 'Bri' });
  }

  it('records what someone paid', () => {
    const state = withPeople();
    const personId = state.bill.people[0].id;
    const next = run(state, { type: 'payment/set', personId, amountCents: 6000 });
    expect(next.bill.payments).toEqual([{ personId, amountCents: 6000 }]);
  });

  it('replaces rather than stacks a second payment from the same person', () => {
    const state = withPeople();
    const personId = state.bill.people[0].id;
    const next = run(
      state,
      { type: 'payment/set', personId, amountCents: 6000 },
      { type: 'payment/set', personId, amountCents: 4000 },
    );
    expect(next.bill.payments).toEqual([{ personId, amountCents: 4000 }]);
  });

  it('drops the row entirely when the amount goes back to zero', () => {
    const state = withPeople();
    const personId = state.bill.people[0].id;
    const next = run(
      state,
      { type: 'payment/set', personId, amountCents: 6000 },
      { type: 'payment/set', personId, amountCents: 0 },
    );
    expect(next.bill.payments).toEqual([]);
  });

  it('never records a negative payment', () => {
    const state = withPeople();
    const personId = state.bill.people[0].id;
    const next = run(state, { type: 'payment/set', personId, amountCents: -500 });
    expect(next.bill.payments).toEqual([]);
  });

  it('takes a departing person’s payment with them', () => {
    let state = withPeople();
    const personId = state.bill.people[0].id;
    state = run(
      state,
      { type: 'payment/set', personId, amountCents: 6000 },
      { type: 'person/remove', personId },
    );
    expect(state.bill.payments).toEqual([]);
  });

  it('offers undo when clearing payments, because it destroys work', () => {
    let state = withPeople();
    const personId = state.bill.people[0].id;
    state = run(state, { type: 'payment/set', personId, amountCents: 6000 });

    state = run(state, { type: 'payment/clearAll' });
    expect(state.bill.payments).toEqual([]);
    expect(state.undo?.label).toBe('Payments cleared');

    state = run(state, { type: 'undo' });
    expect(state.bill.payments).toEqual([{ personId, amountCents: 6000 }]);
  });

  it('is a no-op when there are no payments to clear', () => {
    const state = withPeople();
    expect(billReducer(state, { type: 'payment/clearAll' })).toBe(state);
  });
});

describe('editing an item', () => {
  function withItem() {
    let state = run(
      fresh(),
      { type: 'person/add', name: 'Alex' },
      { type: 'person/add', name: 'Bri' },
    );
    state = run(state, {
      type: 'item/add',
      name: 'Chiken Tika',
      priceCents: 4500,
      assignToAll: true,
    });
    return state;
  }

  it('renames an item', () => {
    let state = withItem();
    state = run(state, {
      type: 'item/update',
      itemId: state.bill.items[0].id,
      name: 'Chicken Tikka',
    });
    expect(state.bill.items[0].name).toBe('Chicken Tikka');
  });

  it('trims a renamed item', () => {
    let state = withItem();
    state = run(state, { type: 'item/update', itemId: state.bill.items[0].id, name: '  Naan  ' });
    expect(state.bill.items[0].name).toBe('Naan');
  });

  it('keeps the old name rather than accepting an empty one', () => {
    let state = withItem();
    state = run(state, { type: 'item/update', itemId: state.bill.items[0].id, name: '   ' });
    expect(state.bill.items[0].name).toBe('Chiken Tika');
  });

  it('corrects a mistyped price', () => {
    let state = withItem();
    state = run(state, { type: 'item/update', itemId: state.bill.items[0].id, priceCents: 1200 });
    expect(state.bill.items[0].priceCents).toBe(1200);
  });

  it('accepts a price of zero, which is not the same as no price', () => {
    let state = withItem();
    state = run(state, { type: 'item/update', itemId: state.bill.items[0].id, priceCents: 0 });
    expect(state.bill.items[0].priceCents).toBe(0);
  });

  it('leaves the price alone when only the name changes', () => {
    let state = withItem();
    state = run(state, { type: 'item/update', itemId: state.bill.items[0].id, name: 'Naan' });
    expect(state.bill.items[0].priceCents).toBe(4500);
  });

  it('keeps who was assigned when the price changes', () => {
    let state = withItem();
    const before = state.bill.items[0].assignments;
    state = run(state, { type: 'item/update', itemId: state.bill.items[0].id, priceCents: 9900 });
    expect(state.bill.items[0].assignments).toEqual(before);
  });

  it('ignores an edit aimed at an item that does not exist', () => {
    const state = run(withItem(), { type: 'item/update', itemId: 'no-such-item', name: 'Nope' });
    expect(state.bill.items[0].name).toBe('Chiken Tika');
  });

  it('offers no undo, because editing destroys nothing', () => {
    let state = withItem();
    state = run(state, { type: 'item/update', itemId: state.bill.items[0].id, name: 'Naan' });
    expect(state.undo).toBeNull();
  });
});

describe('undo', () => {
  it('is offered for destructive actions only', () => {
    let state = run(fresh(), { type: 'person/add', name: 'Alex' });
    expect(state.undo).toBeNull();

    state = run(state, { type: 'item/add', name: 'Steak', priceCents: 4200 });
    expect(state.undo).toBeNull();

    state = run(state, { type: 'item/remove', itemId: state.bill.items[0].id });
    expect(state.undo?.label).toBe('Removed Steak');
  });

  it('is a no-op when there is nothing to undo', () => {
    const state = fresh();
    expect(billReducer(state, { type: 'undo' })).toBe(state);
  });
});

describe('invalid and stale actions', () => {
  function withUndo() {
    let state = run(
      fresh(),
      { type: 'person/add', name: 'Alex' },
      { type: 'person/add', name: 'Bri' },
      { type: 'item/add', name: 'Dinner', priceCents: 3000, assignToAll: true },
      { type: 'item/add', name: 'Extra', priceCents: 100 },
    );
    state = run(state, { type: 'item/remove', itemId: state.bill.items[1].id });
    return state;
  }

  it('rejects invalid item prices without discarding the bill or its undo', () => {
    const state = withUndo();
    const itemId = state.bill.items[0].id;
    for (const priceCents of [NaN, Infinity, -Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(billReducer(state, { type: 'item/add', name: 'Invalid', priceCents })).toBe(state);
      expect(billReducer(state, { type: 'item/update', itemId, name: 'Invalid', priceCents })).toBe(
        state,
      );
    }
    expect(run(state, { type: 'undo' }).bill.items).toHaveLength(2);
  });

  it('rejects non-finite or unsafe weights and amounts at every numeric entry point', () => {
    const state = withUndo();
    const itemId = state.bill.items[0].id;
    const personId = state.bill.people[0].id;
    for (const value of [
      NaN,
      Infinity,
      -Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      -Number.MAX_SAFE_INTEGER - 1,
    ]) {
      const actions: BillAction[] = [
        { type: 'item/setWeight', itemId, personId, weight: value },
        { type: 'item/setAmount', itemId, personId, amountCents: value },
        { type: 'payment/set', personId, amountCents: value },
      ];
      for (const action of actions) expect(billReducer(state, action)).toBe(state);
    }
    for (const percent of [NaN, Infinity, -Infinity]) {
      expect(billReducer(state, { type: 'item/setPercent', itemId, personId, percent })).toBe(
        state,
      );
    }
    expect(calculateSplit(state.bill).reconciles).toBe(true);
  });

  it('rejects an invalid charge patch atomically and keeps undo available', () => {
    const state = withUndo();
    for (const field of ['taxCents', 'tipCents'] as const) {
      for (const value of [
        NaN,
        Infinity,
        -Infinity,
        -1,
        1.5,
        Number.MAX_SAFE_INTEGER + 1,
        undefined,
      ]) {
        expect(
          billReducer(state, { type: 'charges/set', patch: { taxMode: 'amount', [field]: value } }),
        ).toBe(state);
      }
    }
    for (const field of ['taxPercent', 'tipPercent'] as const) {
      for (const value of [NaN, Infinity, -Infinity, -1, 101, undefined]) {
        expect(billReducer(state, { type: 'charges/set', patch: { [field]: value } })).toBe(state);
      }
    }
  });

  it('ignores actions for missing people, items, and assignments without consuming undo', () => {
    const state = withUndo();
    const itemId = state.bill.items[0].id;
    const personId = state.bill.people[0].id;
    const actions: BillAction[] = [
      { type: 'person/remove', personId: 'gone' },
      { type: 'person/toggleSettled', personId: 'gone' },
      { type: 'payment/set', personId: 'gone', amountCents: 100 },
      { type: 'item/toggleAssignee', itemId, personId: 'gone' },
      { type: 'item/update', itemId: 'gone', priceCents: 100 },
      { type: 'item/remove', itemId: 'gone' },
      { type: 'item/toggleAssignee', itemId: 'gone', personId },
      { type: 'item/setWeight', itemId: 'gone', personId, weight: 2 },
      { type: 'item/setPercent', itemId: 'gone', personId, percent: 50 },
      { type: 'item/setAmount', itemId: 'gone', personId, amountCents: 100 },
      { type: 'item/setSplitMode', itemId: 'gone', mode: 'shares' },
      { type: 'item/assignAll', itemId: 'gone' },
      { type: 'item/clearAssignees', itemId: 'gone' },
    ];
    for (const action of actions) expect(billReducer(state, action)).toBe(state);

    const unassigned = {
      ...state,
      bill: { ...state.bill, items: [{ ...state.bill.items[0], assignments: [] }] },
    };
    for (const action of [
      { type: 'item/setWeight', itemId, personId, weight: 2 },
      { type: 'item/setPercent', itemId, personId, percent: 50 },
      { type: 'item/setAmount', itemId, personId, amountCents: 100 },
    ] satisfies BillAction[]) {
      expect(billReducer(unassigned, action)).toBe(unassigned);
    }
  });

  it('keeps valid clamping and rounding behavior for assignment and payment edits', () => {
    const state = withUndo();
    const itemId = state.bill.items[0].id;
    const personId = state.bill.people[0].id;
    expect(
      run(state, { type: 'item/setWeight', itemId, personId, weight: 2.6 }).bill.items[0]
        .assignments[0].weight,
    ).toBe(3);
    expect(
      run(state, { type: 'item/setAmount', itemId, personId, amountCents: 100.6 }).bill.items[0]
        .assignments[0].weight,
    ).toBe(101);
    expect(
      run(state, { type: 'payment/set', personId, amountCents: 100.6 }).bill.payments[0]
        .amountCents,
    ).toBe(101);
    expect(
      run(state, { type: 'item/setPercent', itemId, personId, percent: Number.MAX_VALUE }).bill
        .items[0].assignments[0].weight,
    ).toBe(100);
    const next = run(state, {
      type: 'charges/set',
      patch: { taxPercent: 9.25, tipMode: 'amount', tipCents: 500 },
    });
    expect(calculateSplit(next.bill).reconciles).toBe(true);
    expect(next.bill.charges.taxPercent).toBe(9.25);
    expect(next.bill.charges.tipCents).toBe(500);
  });
});
