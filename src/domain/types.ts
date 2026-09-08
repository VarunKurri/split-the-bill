export type ID = string;

/** 1-8, indexes into the person palette in tokens.css. Wraps for 9+ people. */
export type ColorIndex = number;

export interface Person {
  id: ID;
  name: string;
  colorIndex: ColorIndex;
}

/**
 * One person's claim on an item, weighted.
 *
 * Weights let a shared plate be split unevenly without a second concept:
 * two people splitting evenly are `[1, 1]`; someone who had two thirds of it
 * is `[2, 1]`. Equal weights collapse to the ordinary "shared" case.
 */
export interface Assignment {
  personId: ID;
  weight: number;
}

export interface Item {
  id: ID;
  name: string;
  /** Line total in integer cents — never a float. */
  priceCents: number;
  assignments: Assignment[];
}

export type ChargeMode = 'percent' | 'amount';

/** Whether tip is calculated on the subtotal alone or on subtotal + tax. */
export type TipBasis = 'preTax' | 'postTax';

export interface Charges {
  taxMode: ChargeMode;
  taxPercent: number;
  taxCents: number;
  tipMode: ChargeMode;
  tipPercent: number;
  tipCents: number;
  tipBasis: TipBasis;
}

export interface Bill {
  name: string;
  createdAt: string;
  people: Person[];
  items: Item[];
  charges: Charges;
  settledPersonIds: ID[];
}

/* ------------------------------------------------------------------ */
/* Derived — produced by the split engine, never stored               */
/* ------------------------------------------------------------------ */

export interface PersonLine {
  itemId: ID;
  itemName: string;
  /** This person's weight over the item's total weight, e.g. "1/3". */
  shareLabel: string;
  amountCents: number;
}

export interface PersonBreakdown {
  personId: ID;
  lines: PersonLine[];
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  /**
   * Cents gained or lost versus the exact (fractional) share, caused by
   * allocating whole cents. Surfaced in the UI rather than hidden, so the
   * totals always reconcile visibly.
   */
  roundingCents: number;
  totalCents: number;
}

export interface BillSummary {
  /** Sum of every item's price, assigned or not. */
  subtotalCents: number;
  /** Value of items nobody has claimed yet. */
  unassignedCents: number;
  unassignedItemIds: ID[];
  taxCents: number;
  tipCents: number;
  /** subtotal + tax + tip. */
  totalCents: number;
  /** Tax + tip attributable to unassigned items — owed by nobody yet. */
  unclaimedChargesCents: number;
  perPerson: PersonBreakdown[];
  /** True when Σ person totals + unclaimed value equals the bill total exactly. */
  reconciles: boolean;
}
