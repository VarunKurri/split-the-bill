import { describe, expect, it } from 'vitest';
import { buildShareText } from './shareSummary';
import { calculateSplit } from '../domain/split';
import type { Bill, Payment } from '../domain/types';

function bill(payments: Payment[] = []): Bill {
  return {
    name: 'Dinner',
    createdAt: '2026-09-09T00:00:00.000Z',
    people: [
      { id: 'a', name: 'Alex', colorIndex: 1 },
      { id: 'b', name: 'Bri', colorIndex: 2 },
    ],
    items: [
      {
        id: 'i1',
        name: 'Steak',
        priceCents: 4000,
        splitMode: 'equal',
        assignments: [{ personId: 'a', weight: 1 }],
      },
      {
        id: 'i2',
        name: 'Salad',
        priceCents: 2000,
        splitMode: 'equal',
        assignments: [{ personId: 'b', weight: 1 }],
      },
    ],
    charges: {
      taxMode: 'percent',
      taxPercent: 0,
      taxCents: 0,
      tipMode: 'percent',
      tipPercent: 0,
      tipCents: 0,
      tipBasis: 'preTax',
    },
    payments,
    settledPersonIds: [],
  };
}

function textFor(payments: Payment[] = []): string {
  const b = bill(payments);
  return buildShareText(b, calculateSplit(b));
}

describe('buildShareText', () => {
  it('leads with the total and lists what each person owes', () => {
    const text = textFor();
    expect(text).toContain('Dinner — $60.00');
    expect(text).toContain('Alex: $40.00');
    expect(text).toContain('Bri: $20.00');
  });

  it('says nothing about payments when none are recorded', () => {
    const text = textFor();
    expect(text).not.toContain('Paid:');
    expect(text).not.toContain('Settle up:');
  });

  it('includes the settle-up plan once someone has paid', () => {
    const text = textFor([{ personId: 'a', amountCents: 6000 }]);
    expect(text).toContain('Paid: $60.00 of $60.00');
    expect(text).toContain('Settle up:');
    expect(text).toContain('Bri → Alex: $20.00');
  });

  it('flags money still owed to the restaurant', () => {
    const text = textFor([{ personId: 'a', amountCents: 5000 }]);
    expect(text).toContain('Still owed to the restaurant: $10.00');
  });

  it('flags an overpayment', () => {
    const text = textFor([{ personId: 'a', amountCents: 7000 }]);
    expect(text).toContain('Overpaid by $10.00');
  });

  it('omits the plan when everyone paid their own way', () => {
    const text = textFor([
      { personId: 'a', amountCents: 4000 },
      { personId: 'b', amountCents: 2000 },
    ]);
    expect(text).toContain('Paid: $60.00 of $60.00');
    expect(text).not.toContain('Settle up:');
  });

  it('always explains how tax and tip were shared', () => {
    expect(textFor()).toContain('in proportion to what each person ordered');
  });
});
