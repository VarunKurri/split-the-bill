import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyBill } from './billReducer';
import { clearStoredBill, loadBill, saveBill } from './persistence';
import { calculateSplit } from '../domain/split';
import type { Bill, SplitMode } from '../domain/types';

const STORAGE_KEY = 'split-the-bill:v1';

function installStorage() {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
  vi.stubGlobal('localStorage', storage);
  return storage;
}

describe('bill persistence', () => {
  let storage: Storage;

  beforeEach(() => {
    vi.unstubAllGlobals();
    storage = installStorage();
  });

  it('saves a versioned payload and restores it', () => {
    const bill = { ...createEmptyBill(), name: 'Birthday dinner' };

    expect(saveBill(bill)).toBe(true);
    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? '')).toMatchObject({
      version: 1,
      bill: { name: 'Birthday dinner' },
    });
    expect(loadBill()).toEqual({ bill, warning: null });
  });

  it('migrates the unversioned payload used by earlier releases', () => {
    const bill = { ...createEmptyBill(), name: 'Legacy dinner' };
    storage.setItem(STORAGE_KEY, JSON.stringify(bill));

    expect(loadBill()).toEqual({ bill, warning: null });
  });

  it('opens a clean bill and warns when JSON is corrupt', () => {
    storage.setItem(STORAGE_KEY, '{not json');

    const result = loadBill();

    expect(result.bill.people).toEqual([]);
    expect(result.bill.items).toEqual([]);
    expect(result.warning).toContain('could not be read');
  });

  it('rejects a payload from an unsupported future schema', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, bill: createEmptyBill() }));

    expect(loadBill().warning).toContain('could not be read');
  });

  it('repairs unsafe persisted values before they reach the calculation engine', () => {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        name: '  ',
        createdAt: 'not-a-date',
        people: [
          { id: 'person_1', name: 'Existing ID', colorIndex: 3 },
          { id: 'same', name: ' Alex ', colorIndex: 99 },
          { id: 'same', name: '', colorIndex: -1 },
        ],
        items: [
          {
            id: 'item',
            name: ' Pasta ',
            priceCents: -1200,
            splitMode: 'equal',
            assignments: [
              { personId: 'same', weight: -2 },
              { personId: 'person_1', weight: 1 },
              { personId: 'person_1', weight: 1 },
            ],
          },
          { id: 'item', name: '', priceCents: 500, assignments: [] },
        ],
        charges: {
          taxMode: 'percent',
          taxPercent: 120,
          taxCents: -1,
          tipMode: 'amount',
          tipPercent: -20,
          tipCents: -5,
          tipBasis: 'preTax',
        },
        payments: [{ personId: 'same', amountCents: -100 }],
        settledPersonIds: ['same', 'same', 'missing'],
      }),
    );

    const { bill, warning } = loadBill();

    expect(warning).toBeNull();
    expect(bill.name).toBe('Dinner');
    expect(Number.isNaN(new Date(bill.createdAt).valueOf())).toBe(false);
    expect(bill.people).toEqual([
      { id: 'person_1', name: 'Existing ID', colorIndex: 3 },
      { id: 'same', name: 'Alex', colorIndex: 2 },
      { id: 'person_2', name: 'Person 3', colorIndex: 3 },
    ]);
    expect(bill.items).toMatchObject([
      {
        id: 'item',
        name: 'Pasta',
        priceCents: 0,
        assignments: [{ personId: 'person_1', weight: 1 }],
      },
      { id: 'item_1', name: 'Item', priceCents: 500 },
    ]);
    expect(bill.charges).toMatchObject({
      taxPercent: 8.5,
      taxCents: 0,
      tipPercent: 20,
      tipCents: 0,
    });
    expect(bill.payments).toEqual([]);
    expect(bill.settledPersonIds).toEqual(['same']);
  });

  it('reports write and clear failures to their caller', () => {
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    vi.spyOn(storage, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(saveBill(createEmptyBill())).toBe(false);
    expect(clearStoredBill()).toBe(false);
  });

  it.each(['percent', 'amount'] satisfies SplitMode[])(
    'preserves zero entries and calculated totals across a refresh in %s mode',
    (splitMode) => {
      for (const weights of [
        [0, 0],
        [100, 0],
      ]) {
        const bill: Bill = {
          ...createEmptyBill(),
          people: [
            { id: 'a', name: 'Alex', colorIndex: 1 },
            { id: 'b', name: 'Bri', colorIndex: 2 },
          ],
          items: [
            {
              id: 'item',
              name: 'Dinner',
              priceCents: 1000,
              splitMode,
              assignments: weights.map((weight, i) => ({ personId: i === 0 ? 'a' : 'b', weight })),
            },
          ],
        };
        expect(saveBill(bill)).toBe(true);
        const restored = loadBill();
        expect(restored).toEqual({ bill, warning: null });
        expect(calculateSplit(restored.bill)).toEqual(calculateSplit(bill));
      }
    },
  );

  it('keeps explicit zero weights without turning invalid weights into selected entries', () => {
    const people = ['zero', 'negative', 'null', 'string', 'legacy'].map((id) => ({
      id,
      name: id,
      colorIndex: 1,
    }));
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...createEmptyBill(),
        people,
        items: [
          {
            id: 'item',
            name: 'Dinner',
            priceCents: 1000,
            splitMode: 'percent',
            assignments: [
              { personId: 'zero', weight: 0 },
              { personId: 'zero', weight: 50 },
              { personId: 'negative', weight: -1 },
              { personId: 'null', weight: null },
              { personId: 'string', weight: '0' },
              { personId: 'legacy' },
              { personId: 'missing', weight: 0 },
            ],
          },
        ],
      }),
    );
    expect(loadBill().bill.items[0].assignments).toEqual([
      { personId: 'zero', weight: 0 },
      { personId: 'legacy', weight: 1 },
    ]);
  });
});
