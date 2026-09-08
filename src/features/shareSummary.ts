import { formatCents } from '../domain/money';
import type { Bill, BillSummary } from '../domain/types';

/**
 * A plain-text summary, sized for a group chat.
 *
 * The end of a dinner is somebody reading numbers off a phone. Pasting the
 * whole thing into the group chat is faster and less error-prone, so the
 * share output is text rather than a screenshot or a link.
 */
export function buildShareText(bill: Bill, summary: BillSummary): string {
  const lines: string[] = [];

  lines.push(`${bill.name} — ${formatCents(summary.totalCents)}`);
  lines.push('');

  for (const person of bill.people) {
    const breakdown = summary.perPerson.find((p) => p.personId === person.id);
    if (!breakdown) continue;
    const settled = bill.settledPersonIds.includes(person.id) ? ' ✓' : '';
    lines.push(`${person.name}: ${formatCents(breakdown.totalCents)}${settled}`);
  }

  lines.push('');
  lines.push(
    `Subtotal ${formatCents(summary.subtotalCents)} · Tax ${formatCents(
      summary.taxCents,
    )} · Tip ${formatCents(summary.tipCents)}`,
  );

  if (summary.unassignedCents > 0) {
    lines.push(
      `Still unassigned: ${formatCents(summary.unassignedCents)} (+ ${formatCents(
        summary.unclaimedChargesCents,
      )} tax and tip)`,
    );
  }

  lines.push('Tax and tip are shared in proportion to what each person ordered.');

  return lines.join('\n');
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
