import { formatCents } from '../domain/money';
import { perShareCents } from '../domain/split';
import type { Bill, BillSummary, ID, Item, PersonBreakdown } from '../domain/types';

/**
 * A plain-text summary, sized for a group chat.
 *
 * The end of a dinner is somebody reading numbers off a phone. Pasting the
 * whole thing into the group chat is faster and less error-prone, so the share
 * output is text rather than a screenshot or a link.
 *
 * It is deliberately long. The question this has to survive is "why do I owe
 * that?", asked by someone who wasn't holding the phone — so it shows the
 * items, who was on each one, the rate behind every charge, each person's
 * derivation, what has actually been paid, and who owes whom. A total with no
 * working shown is exactly the thing that starts an argument.
 *
 * No column alignment: chat apps render this in a proportional font, so padded
 * columns would arrive ragged. Labelled lines survive the paste.
 */
export function buildShareText(bill: Bill, summary: BillSummary): string {
  const out: string[] = [];

  out.push(`${bill.name}: ${formatCents(summary.totalCents)}`);
  out.push(`${bill.people.length} ${bill.people.length === 1 ? 'person' : 'people'}`);

  /* ---- What was ordered ---- */
  if (bill.items.length > 0) {
    out.push('', 'ITEMS');
    for (const item of bill.items) {
      out.push(`• ${item.name}: ${formatCents(item.priceCents)}`);
      out.push(`    ${whoHadIt(item, bill)}`);
    }
  }

  /* ---- How the charges were worked out ---- */
  out.push('', 'CHARGES');
  out.push(`Subtotal: ${formatCents(summary.subtotalCents)}`);
  out.push(`${taxLabel(bill)}: ${formatCents(summary.taxCents)}`);
  out.push(`${tipLabel(bill)}: ${formatCents(summary.tipCents)}`);
  out.push(`Total: ${formatCents(summary.totalCents)}`);

  /* ---- The derivation, per person ---- */
  if (bill.people.length > 0) {
    out.push('', 'WHAT EACH PERSON OWES');
    for (const person of bill.people) {
      const breakdown = summary.perPerson.find((p) => p.personId === person.id);
      if (!breakdown) continue;

      const settled = bill.settledPersonIds.includes(person.id) ? ' (marked settled)' : '';
      out.push(`${person.name}: ${formatCents(breakdown.totalCents)}${settled}`);
      out.push(...personDetail(breakdown));
    }
  }

  /* ---- The one thing that can make the total wrong ---- */
  if (summary.unassignedCents > 0) {
    out.push('', 'NOT ASSIGNED TO ANYONE');
    const names = summary.unassignedItemIds
      .map((id) => bill.items.find((item) => item.id === id))
      .filter((item): item is Item => Boolean(item))
      .map((item) => `${item.name} (${formatCents(item.priceCents)})`);
    out.push(names.join(', '));
    out.push(
      `${formatCents(summary.unassignedCents)} of items, plus ${formatCents(
        summary.unclaimedTaxCents,
      )} tax and ${formatCents(summary.unclaimedTipCents)} tip.`,
    );
    out.push('Nobody is being charged for these yet.');
  }

  /* ---- Money that has actually changed hands ---- */
  if (summary.paidCents > 0) {
    out.push('', 'PAID TO THE RESTAURANT');
    out.push('What each person actually put on the bill, whatever they ordered:');
    for (const person of bill.people) {
      const breakdown = summary.perPerson.find((p) => p.personId === person.id);
      if (!breakdown || breakdown.paidCents === 0) continue;
      out.push(`${person.name} paid ${formatCents(breakdown.paidCents)}`);
    }
    out.push(`${formatCents(summary.paidCents)} of ${formatCents(summary.totalCents)}`);
    if (summary.unpaidCents > 0) {
      out.push(`Still owed to the restaurant: ${formatCents(summary.unpaidCents)}`);
    } else if (summary.unpaidCents < 0) {
      out.push(`Overpaid by ${formatCents(-summary.unpaidCents)}`);
    }
  }

  if (summary.transfers.length > 0) {
    out.push('', 'SETTLE UP');
    out.push('Squaring what each person paid against what they owe:');
    for (const transfer of summary.transfers) {
      out.push(
        `${nameOf(bill, transfer.fromPersonId)} pays ${nameOf(bill, transfer.toPersonId)}: ${formatCents(
          transfer.amountCents,
        )}`,
      );
    }
  }

  out.push('', 'Tax and tip are shared in proportion to what each person ordered,');
  out.push('not split evenly, so nobody pays tip on a meal they did not have.');

  return out.join('\n');
}

/** Each item share, then the charges, then any rounding, indented under a name. */
function personDetail(breakdown: PersonBreakdown): string[] {
  if (breakdown.lines.length === 0) return ['    nothing assigned yet'];

  const lines = breakdown.lines.map(
    (line) =>
      `    ${line.itemName}` +
      (line.shareLabel === 'full' ? '' : ` (${line.shareLabel})`) +
      `: ${formatCents(line.amountCents)}`,
  );

  lines.push(`    subtotal ${formatCents(breakdown.subtotalCents)}`);
  lines.push(
    `    + tax ${formatCents(breakdown.taxCents)} + tip ${formatCents(breakdown.tipCents)}`,
  );
  if (breakdown.roundingCents !== 0) {
    lines.push(`    rounding ${formatCents(breakdown.roundingCents)}`);
  }
  return lines;
}

/** "Varun, Sujai · $11.00 each": who was on an item and what it cost them. */
function whoHadIt(item: Item, bill: Bill): string {
  const names = item.assignments
    .map((a) => bill.people.find((p) => p.id === a.personId)?.name)
    .filter((name): name is string => Boolean(name));

  if (names.length === 0) return 'nobody yet';
  if (names.length === 1) return names[0];

  const each = perShareCents(item);
  const list = names.join(', ');
  return each === null ? `${list} (split unevenly)` : `${list} · ${formatCents(each)} each`;
}

function taxLabel(bill: Bill): string {
  return bill.charges.taxMode === 'percent' ? `Tax (${trim(bill.charges.taxPercent)}%)` : 'Tax';
}

function tipLabel(bill: Bill): string {
  if (bill.charges.tipMode !== 'percent') return 'Tip';
  const basis = bill.charges.tipBasis === 'postTax' ? 'post-tax total' : 'subtotal';
  return `Tip (${trim(bill.charges.tipPercent)}% of the ${basis})`;
}

function trim(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function nameOf(bill: Bill, personId: ID): string {
  return bill.people.find((p) => p.id === personId)?.name ?? 'Someone';
}

/**
 * Copy to the clipboard, falling back to a hidden textarea for browsers or
 * contexts where the async Clipboard API is unavailable (notably non-HTTPS).
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
