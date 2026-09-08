import { describe, expect, it } from 'vitest';
import { calculateSplit, perShareCents } from './split';
import { sum } from './money';
import type { Bill, Charges, Item, Person } from './types';

const NO_CHARGES: Charges = {
  taxMode: 'percent',
  taxPercent: 0,
  taxCents: 0,
  tipMode: 'percent',
  tipPercent: 0,
  tipCents: 0,
  tipBasis: 'preTax',
};

function person(id: string, name: string, colorIndex = 1): Person {
  return { id, name, colorIndex };
}

function item(id: string, name: string, priceCents: number, ...owners: string[]): Item {
  return {
    id,
    name,
    priceCents,
    assignments: owners.map((personId) => ({ personId, weight: 1 })),
  };
}

function bill(people: Person[], items: Item[], charges: Charges = NO_CHARGES): Bill {
  return {
    name: 'Test bill',
    createdAt: '2026-09-08T00:00:00.000Z',
    people,
    items,
    charges,
    settledPersonIds: [],
  };
}

describe('calculateSplit — item assignment', () => {
  it('gives a solely-owned item entirely to its owner', () => {
    const result = calculateSplit(
      bill([person('a', 'Alex'), person('b', 'Bri')], [item('i1', 'Steak', 4200, 'a')]),
    );
    expect(result.perPerson[0].totalCents).toBe(4200);
    expect(result.perPerson[1].totalCents).toBe(0);
  });

  it('splits a shared item evenly and keeps the cents', () => {
    const result = calculateSplit(
      bill(
        [person('a', 'Alex'), person('b', 'Bri'), person('c', 'Chidi')],
        [item('i1', 'Burrata', 1000, 'a', 'b', 'c')],
      ),
    );
    expect(result.perPerson.map((p) => p.subtotalCents)).toEqual([334, 333, 333]);
    expect(sum(result.perPerson.map((p) => p.subtotalCents))).toBe(1000);
  });

  it('honours uneven share weights', () => {
    const shared: Item = {
      id: 'i1',
      name: 'Whole fish',
      priceCents: 3000,
      assignments: [
        { personId: 'a', weight: 2 },
        { personId: 'b', weight: 1 },
      ],
    };
    const result = calculateSplit(bill([person('a', 'Alex'), person('b', 'Bri')], [shared]));
    expect(result.perPerson[0].subtotalCents).toBe(2000);
    expect(result.perPerson[1].subtotalCents).toBe(1000);
  });

  it('labels each line with the share it represents', () => {
    const result = calculateSplit(
      bill([person('a', 'Alex'), person('b', 'Bri')], [item('i1', 'Burrata', 1000, 'a', 'b')]),
    );
    expect(result.perPerson[0].lines[0].shareLabel).toBe('1/2');
  });
});

describe('calculateSplit — the friend who only had a salad', () => {
  it('charges tax and tip in proportion to what each person ordered', () => {
    // Alex: $60 steak. Bri: $12 salad. 10% tax, 20% tip on pre-tax subtotal.
    const charges: Charges = {
      ...NO_CHARGES,
      taxPercent: 10,
      tipPercent: 20,
    };
    const result = calculateSplit(
      bill(
        [person('a', 'Alex'), person('b', 'Bri')],
        [item('i1', 'Steak', 6000, 'a'), item('i2', 'Salad', 1200, 'b')],
        charges,
      ),
    );

    expect(result.subtotalCents).toBe(7200);
    expect(result.taxCents).toBe(720);
    expect(result.tipCents).toBe(1440);

    // Alex ordered 60/72 of the food, so pays 60/72 of tax and tip.
    expect(result.perPerson[0].taxCents).toBe(600);
    expect(result.perPerson[0].tipCents).toBe(1200);
    expect(result.perPerson[0].totalCents).toBe(7800);

    // Bri pays tip on a salad, not on a steak.
    expect(result.perPerson[1].taxCents).toBe(120);
    expect(result.perPerson[1].tipCents).toBe(240);
    expect(result.perPerson[1].totalCents).toBe(1560);

    expect(result.reconciles).toBe(true);
  });

  it('is meaningfully cheaper for the salad-eater than an even split would be', () => {
    const charges: Charges = { ...NO_CHARGES, taxPercent: 10, tipPercent: 20 };
    const result = calculateSplit(
      bill(
        [person('a', 'Alex'), person('b', 'Bri')],
        [item('i1', 'Steak', 6000, 'a'), item('i2', 'Salad', 1200, 'b')],
        charges,
      ),
    );
    const evenSplit = result.totalCents / 2;
    expect(result.perPerson[1].totalCents).toBeLessThan(evenSplit);
  });
});

describe('calculateSplit — tax and tip', () => {
  it('supports a flat tax amount instead of a percentage', () => {
    const charges: Charges = { ...NO_CHARGES, taxMode: 'amount', taxCents: 513 };
    const result = calculateSplit(
      bill([person('a', 'Alex')], [item('i1', 'Dinner', 5000, 'a')], charges),
    );
    expect(result.taxCents).toBe(513);
    expect(result.perPerson[0].totalCents).toBe(5513);
  });

  it('tips on the post-tax total when asked to', () => {
    const preTax = calculateSplit(
      bill([person('a', 'Alex')], [item('i1', 'Dinner', 10000, 'a')], {
        ...NO_CHARGES,
        taxPercent: 10,
        tipPercent: 20,
        tipBasis: 'preTax',
      }),
    );
    const postTax = calculateSplit(
      bill([person('a', 'Alex')], [item('i1', 'Dinner', 10000, 'a')], {
        ...NO_CHARGES,
        taxPercent: 10,
        tipPercent: 20,
        tipBasis: 'postTax',
      }),
    );
    expect(preTax.tipCents).toBe(2000);
    expect(postTax.tipCents).toBe(2200);
  });
});

describe('calculateSplit — unassigned items', () => {
  it('reports unassigned value instead of spreading it silently', () => {
    const result = calculateSplit(
      bill(
        [person('a', 'Alex'), person('b', 'Bri')],
        [item('i1', 'Steak', 6000, 'a'), item('i2', 'Mystery side', 900)],
      ),
    );
    expect(result.unassignedCents).toBe(900);
    expect(result.unassignedItemIds).toEqual(['i2']);
    expect(sum(result.perPerson.map((p) => p.subtotalCents))).toBe(6000);
  });

  it('leaves the unassigned item’s tax and tip unclaimed', () => {
    const charges: Charges = { ...NO_CHARGES, taxPercent: 10, tipPercent: 20 };
    const result = calculateSplit(
      bill(
        [person('a', 'Alex')],
        [item('i1', 'Steak', 6000, 'a'), item('i2', 'Mystery side', 4000)],
        charges,
      ),
    );
    // Alex ordered 60% of the food and is charged 60% of the charges — not 100%.
    expect(result.perPerson[0].taxCents).toBe(600);
    expect(result.perPerson[0].tipCents).toBe(1200);
    expect(result.unclaimedChargesCents).toBe(400 + 800);
    expect(result.reconciles).toBe(true);
  });
});

describe('calculateSplit — reconciliation', () => {
  const charges: Charges = { ...NO_CHARGES, taxPercent: 8.5, tipPercent: 18 };

  it('always adds back up to the bill total', () => {
    const people = [
      person('a', 'Alex'),
      person('b', 'Bri'),
      person('c', 'Chidi'),
      person('d', 'Dana'),
    ];
    const items = [
      item('i1', 'Branzino', 4200, 'a'),
      item('i2', 'Burrata', 1700, 'a', 'b', 'c'),
      item('i3', 'Cacio e pepe', 2600, 'b'),
      item('i4', 'Negroni', 1900, 'c', 'd'),
      item('i5', 'Tiramisu', 1400, 'a', 'b', 'c', 'd'),
      item('i6', 'Sparkling water', 900, 'a', 'b', 'c', 'd'),
    ];
    const result = calculateSplit(bill(people, items, charges));

    expect(result.reconciles).toBe(true);
    expect(sum(result.perPerson.map((p) => p.totalCents))).toBe(result.totalCents);
  });

  it('reconciles across a wide sweep of awkward prices and party sizes', () => {
    for (let price = 101; price < 4000; price += 137) {
      for (let headcount = 2; headcount <= 7; headcount += 1) {
        const people = Array.from({ length: headcount }, (_, i) => person(`p${i}`, `P${i}`));
        const shared = item('shared', 'Shared plate', price, ...people.map((p) => p.id));
        const solo = item('solo', 'Solo plate', price * 2, people[0].id);
        const result = calculateSplit(bill(people, [shared, solo], charges));

        expect(result.reconciles).toBe(true);
        expect(sum(result.perPerson.map((p) => p.totalCents))).toBe(result.totalCents);
      }
    }
  });

  it('records the rounding adjustment it applied', () => {
    const people = [person('a', 'A'), person('b', 'B'), person('c', 'C')];
    const result = calculateSplit(
      bill(people, [item('i1', 'Shared', 1000, 'a', 'b', 'c')], {
        ...NO_CHARGES,
        taxPercent: 8.5,
        tipPercent: 18,
      }),
    );
    // Whatever the adjustments are, they cancel out across the party.
    expect(sum(result.perPerson.map((p) => p.roundingCents))).toBe(0);
  });
});

describe('calculateSplit — degenerate input', () => {
  it('handles an empty bill', () => {
    const result = calculateSplit(bill([], []));
    expect(result.totalCents).toBe(0);
    expect(result.perPerson).toEqual([]);
    expect(result.reconciles).toBe(true);
  });

  it('handles people with no items', () => {
    const result = calculateSplit(bill([person('a', 'Alex')], []));
    expect(result.perPerson[0].totalCents).toBe(0);
    expect(result.reconciles).toBe(true);
  });

  it('handles a zero-value item without dividing by zero', () => {
    const result = calculateSplit(
      bill([person('a', 'Alex'), person('b', 'Bri')], [item('i1', 'Comped dessert', 0, 'a', 'b')], {
        ...NO_CHARGES,
        taxPercent: 8.5,
        tipPercent: 20,
      }),
    );
    expect(result.perPerson.every((p) => p.totalCents === 0)).toBe(true);
    expect(result.reconciles).toBe(true);
  });

  it('ignores assignments pointing at a person who has been removed', () => {
    const stale = bill([person('a', 'Alex')], [item('i1', 'Shared', 1000, 'a', 'ghost')]);
    const result = calculateSplit(stale);
    expect(result.perPerson[0].subtotalCents).toBe(1000);
    expect(result.reconciles).toBe(true);
  });
});

describe('perShareCents', () => {
  it('reports the per-head amount for an evenly shared item', () => {
    expect(perShareCents(item('i1', 'Burrata', 4200, 'a', 'b', 'c'))).toBe(1400);
  });

  it('returns null when the item is not evenly shared', () => {
    expect(perShareCents(item('i1', 'Solo', 4200, 'a'))).toBeNull();
    expect(
      perShareCents({
        id: 'i1',
        name: 'Uneven',
        priceCents: 3000,
        assignments: [
          { personId: 'a', weight: 2 },
          { personId: 'b', weight: 1 },
        ],
      }),
    ).toBeNull();
  });
});
