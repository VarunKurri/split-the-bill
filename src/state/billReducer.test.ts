import { describe, expect, it } from 'vitest';
import { billReducer, createEmptyBill, type BillAction, type BillState } from './billReducer';

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

  it('rounds fractional percentages up to whole shares when switching to shares', () => {
    let state = withSharedItem();
    const itemId = state.bill.items[0].id;

    state = run(
      state,
      { type: 'item/setSplitMode', itemId, mode: 'percent' },
      { type: 'item/setSplitMode', itemId, mode: 'shares' },
    );
    expect(state.bill.items[0].assignments.every((a) => Number.isInteger(a.weight))).toBe(true);
    expect(state.bill.items[0].assignments.every((a) => a.weight >= 1)).toBe(true);
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
