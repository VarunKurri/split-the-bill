import { allocate, exactShare, percentOf, sum } from './money';
import type {
  Bill,
  BillSummary,
  Charges,
  ID,
  Item,
  PersonBreakdown,
  PersonLine,
} from './types';

/**
 * The whole calculation, as one pure function of the bill.
 *
 * Three decisions are encoded here, and they are the ones that make or break
 * whether the answer feels fair at the table:
 *
 * 1. Items are split by weight, then by whole cents via largest-remainder
 *    allocation — so a $10 plate shared three ways is 3.34 / 3.33 / 3.33 and
 *    never 3.33 x 3 with a cent quietly vanishing.
 *
 * 2. Tax and tip are allocated in proportion to each person's item subtotal,
 *    not per head. The friend who only had a salad pays tip on a salad.
 *
 * 3. Unassigned items participate in that proportional allocation as a
 *    phantom claimant. Their tax and tip stay unclaimed rather than being
 *    silently redistributed onto the people who have already been assigned —
 *    so nobody is quietly overcharged for a plate nobody has owned up to.
 */
export function calculateSplit(bill: Bill): BillSummary {
  const { people, items, charges } = bill;

  const subtotalCents = sum(items.map((item) => item.priceCents));

  // ---- 1. Item shares -------------------------------------------------
  const personSubtotals = new Map<ID, number>(people.map((p) => [p.id, 0]));
  const personLines = new Map<ID, PersonLine[]>(people.map((p) => [p.id, []]));
  const unassignedItemIds: ID[] = [];
  let unassignedCents = 0;

  for (const item of items) {
    const claims = activeAssignments(item, people);

    if (claims.length === 0) {
      unassignedItemIds.push(item.id);
      unassignedCents += item.priceCents;
      continue;
    }

    const weights = claims.map((c) => c.weight);
    const totalWeight = sum(weights);
    const shares = allocate(item.priceCents, weights);

    claims.forEach((claim, index) => {
      const amountCents = shares[index];
      personSubtotals.set(claim.personId, (personSubtotals.get(claim.personId) ?? 0) + amountCents);
      personLines.get(claim.personId)?.push({
        itemId: item.id,
        itemName: item.name,
        shareLabel: claims.length === 1 ? 'full' : `${claim.weight}/${totalWeight}`,
        amountCents,
      });
    });
  }

  // ---- 2. Tax and tip totals -----------------------------------------
  const taxCents = resolveTax(charges, subtotalCents);
  const tipCents = resolveTip(charges, subtotalCents, taxCents);
  const totalCents = subtotalCents + taxCents + tipCents;

  // ---- 3. Allocate charges proportionally ------------------------------
  // The unassigned value is the final weight; its slice is reported as
  // unclaimed rather than handed to anybody.
  const chargeWeights = [...people.map((p) => personSubtotals.get(p.id) ?? 0), unassignedCents];
  const totalChargeWeight = sum(chargeWeights);

  const taxShares = allocate(taxCents, chargeWeights);
  const tipShares = allocate(tipCents, chargeWeights);

  const perPerson: PersonBreakdown[] = people.map((person, index) => {
    const subtotal = personSubtotals.get(person.id) ?? 0;
    const tax = taxShares[index];
    const tip = tipShares[index];

    const exactTax = exactShare(taxCents, subtotal, totalChargeWeight);
    const exactTip = exactShare(tipCents, subtotal, totalChargeWeight);
    const roundingCents = Math.round(tax + tip - (exactTax + exactTip));

    return {
      personId: person.id,
      lines: personLines.get(person.id) ?? [],
      subtotalCents: subtotal,
      taxCents: tax,
      tipCents: tip,
      roundingCents,
      totalCents: subtotal + tax + tip,
    };
  });

  const unclaimedChargesCents = taxShares[people.length] + tipShares[people.length];
  const claimed = sum(perPerson.map((p) => p.totalCents));
  const reconciles = claimed + unassignedCents + unclaimedChargesCents === totalCents;

  return {
    subtotalCents,
    unassignedCents,
    unassignedItemIds,
    taxCents,
    tipCents,
    totalCents,
    unclaimedChargesCents,
    perPerson,
    reconciles,
  };
}

/**
 * Assignments pointing at a person who has since been removed are ignored
 * rather than trusted. The reducer prunes them, but the engine must not
 * produce a wrong total if it is ever handed stale state (an old localStorage
 * payload, say).
 */
function activeAssignments(item: Item, people: { id: ID }[]) {
  const known = new Set(people.map((p) => p.id));
  return item.assignments.filter((a) => known.has(a.personId) && a.weight > 0);
}

function resolveTax(charges: Charges, subtotalCents: number): number {
  return charges.taxMode === 'percent'
    ? percentOf(subtotalCents, charges.taxPercent)
    : charges.taxCents;
}

function resolveTip(charges: Charges, subtotalCents: number, taxCents: number): number {
  if (charges.tipMode === 'amount') return charges.tipCents;
  const base = charges.tipBasis === 'postTax' ? subtotalCents + taxCents : subtotalCents;
  return percentOf(base, charges.tipPercent);
}

/* ------------------------------------------------------------------ */
/* Small selectors used by the UI                                      */
/* ------------------------------------------------------------------ */

export function isUnassigned(item: Item): boolean {
  return item.assignments.length === 0;
}

export function isShared(item: Item): boolean {
  return item.assignments.length > 1;
}

/** Per-share amount for an evenly shared item, for the "$14.00 each" hint. */
export function perShareCents(item: Item): number | null {
  if (item.assignments.length < 2) return null;
  const weights = item.assignments.map((a) => a.weight);
  const uneven = weights.some((w) => w !== weights[0]);
  if (uneven) return null;
  return allocate(item.priceCents, weights)[0];
}
