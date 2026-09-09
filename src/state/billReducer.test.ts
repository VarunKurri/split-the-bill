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
