import { describe, expect, it } from 'vitest';
import { buildShareText } from './shareSummary';
import { calculateSplit } from '../domain/split';
import type { Bill, Charges, Item, Payment } from '../domain/types';

const CHARGES: Charges = {
  taxMode: 'percent',
  taxPercent: 10,
  taxCents: 0,
  tipMode: 'percent',
  tipPercent: 20,
  tipCents: 0,
  tipBasis: 'preTax',
};

function solo(id: string, name: string, priceCents: number, owner: string): Item {
  return {
    id,
    name,
    priceCents,
    splitMode: 'equal',
    assignments: [{ personId: owner, weight: 1 }],
  };
}

function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    name: 'Dinner',
    createdAt: '2026-09-09T00:00:00.000Z',
    people: [
      { id: 'a', name: 'Alex', colorIndex: 1 },
      { id: 'b', name: 'Bri', colorIndex: 2 },
    ],
    items: [solo('i1', 'Steak', 4000, 'a'), solo('i2', 'Salad', 2000, 'b')],
    charges: CHARGES,
    payments: [],
    settledPersonIds: [],
    ...overrides,
  };
}

function textFor(overrides: Partial<Bill> = {}): string {
  const b = bill(overrides);
  return buildShareText(b, calculateSplit(b));
}

function pay(...payments: Payment[]): Partial<Bill> {
  return { payments };
}

describe('buildShareText', () => {
  it('leads with the bill name, total and party size', () => {
    const text = textFor();
    expect(text).toContain('Dinner: $78.00');
    expect(text).toContain('2 people');
  });

  it('lists every item with its price and who had it', () => {
    const text = textFor();
    expect(text).toContain('• Steak: $40.00');
    expect(text).toContain('Alex');
    expect(text).toContain('• Salad: $20.00');
    expect(text).toContain('Bri');
  });

  it('names who shared an item and what it cost each of them', () => {
    const shared: Item = {
      id: 'i3',
      name: 'Burrata',
      priceCents: 1000,
      splitMode: 'equal',
      assignments: [
        { personId: 'a', weight: 1 },
        { personId: 'b', weight: 1 },
      ],
    };
    expect(textFor({ items: [shared] })).toContain('Alex, Bri · $5.00 each');
  });

  it('shows the rate behind tax and tip, not just the amount', () => {
    const text = textFor();
    expect(text).toContain('Tax (10%): $6.00');
    expect(text).toContain('Tip (20% of the subtotal): $12.00');
  });

  it('says which base the tip was taken on', () => {
    const text = textFor({ charges: { ...CHARGES, tipBasis: 'postTax' } });
    expect(text).toContain('Tip (20% of the post-tax total)');
  });

  it('drops the rate when a charge was entered as a flat amount', () => {
    const text = textFor({
      charges: { ...CHARGES, taxMode: 'amount', taxCents: 513 },
    });
    expect(text).toContain('Tax: $5.13');
    expect(text).not.toContain('Tax (');
  });

  it('shows each person’s derivation, not just their total', () => {
    const text = textFor();
    expect(text).toContain('Alex: $52.00');
    expect(text).toContain('Steak: $40.00');
    expect(text).toContain('subtotal $40.00');
    expect(text).toContain('+ tax $4.00 + tip $8.00');
  });

  it('marks people who have been settled', () => {
    expect(textFor({ settledPersonIds: ['a'] })).toContain('Alex: $52.00 (marked settled)');
  });

  it('says so when someone has nothing assigned', () => {
    expect(textFor({ items: [solo('i1', 'Steak', 4000, 'a')] })).toContain('nothing assigned yet');
  });

  it('calls out unassigned items with tax and tip broken apart', () => {
    const orphan: Item = {
      id: 'i3',
      name: 'Mystery side',
      priceCents: 1000,
      splitMode: 'equal',
      assignments: [],
    };
    const text = textFor({ items: [solo('i1', 'Steak', 4000, 'a'), orphan] });

    expect(text).toContain('NOT ASSIGNED TO ANYONE');
    expect(text).toContain('Mystery side ($10.00)');
    // The confusing part is a combined figure, so the two are stated apart.
    expect(text).toContain('$10.00 of items, plus $1.00 tax and $2.00 tip');
    expect(text).toContain('Nobody is being charged for these yet.');
  });

  it('says nothing about payments when none are recorded', () => {
    const text = textFor();
    expect(text).not.toContain('PAID TO THE RESTAURANT');
    expect(text).not.toContain('SETTLE UP');
  });

  it('names every payer and what they each put in', () => {
    const text = textFor(
      pay({ personId: 'a', amountCents: 5000 }, { personId: 'b', amountCents: 2800 }),
    );
    expect(text).toContain('Alex paid $50.00');
    expect(text).toContain('Bri paid $28.00');
    expect(text).toContain('$78.00 of $78.00');
  });

  it('leaves out people who paid nothing', () => {
    const text = textFor(pay({ personId: 'a', amountCents: 7800 }));
    expect(text).toContain('Alex paid $78.00');
    expect(text).not.toContain('Bri paid');
  });

  it('includes the settle-up plan once someone has covered the bill', () => {
    const text = textFor(pay({ personId: 'a', amountCents: 7800 }));
    expect(text).toContain('SETTLE UP');
    expect(text).toContain('Bri pays Alex: $26.00');
  });

  it('flags money still owed to the restaurant', () => {
    expect(textFor(pay({ personId: 'a', amountCents: 5000 }))).toContain(
      'Still owed to the restaurant: $28.00',
    );
  });

  it('flags an overpayment', () => {
    expect(textFor(pay({ personId: 'a', amountCents: 9000 }))).toContain('Overpaid by $12.00');
  });

  it('needs no settle-up when everyone paid their own way', () => {
    const text = textFor(
      pay({ personId: 'a', amountCents: 5200 }, { personId: 'b', amountCents: 2600 }),
    );
    expect(text).toContain('PAID TO THE RESTAURANT');
    expect(text).not.toContain('SETTLE UP');
  });

  it('always explains how tax and tip were shared', () => {
    expect(textFor()).toContain('in proportion to what each person ordered');
  });

  it('uses no em dashes anywhere', () => {
    // They read as filler in a chat message. Asserted rather than tidied once,
    // so they don't creep back in the next time this text is edited.
    const orphan: Item = {
      id: 'i3',
      name: 'Mystery side',
      priceCents: 1000,
      splitMode: 'equal',
      assignments: [],
    };
    const text = textFor({
      items: [solo('i1', 'Steak', 4000, 'a'), orphan],
      payments: [{ personId: 'a', amountCents: 5000 }],
      settledPersonIds: ['b'],
    });

    expect(text).not.toContain('—');
    expect(text).not.toContain('–');
  });
});
