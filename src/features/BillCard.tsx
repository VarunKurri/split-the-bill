import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { formatCents } from '../domain/money';
import { perShareCents } from '../domain/split';
import type { Item } from '../domain/types';
import { useBill } from '../state/useBill';
import styles from './BillCard.module.css';

/**
 * The bill as the restaurant would print it — every line, then the charges,
 * then the total.
 *
 * Nothing here is editable. The Items card is where you work; this is where
 * you check the work, and the two answer different questions: "what am I still
 * assigning?" versus "does this match the piece of paper on the table?".
 */
export function BillCard() {
  const { bill, summary } = useBill();

  if (bill.items.length === 0) return null;

  const { charges } = bill;

  return (
    <Card title="The Bill" className={styles.card}>
      <ul className={styles.lines}>
        {bill.items.map((item) => (
          <li className={styles.line} key={item.id}>
            <span className={styles.name}>{item.name}</span>
            <span className={styles.who}>{whoHadIt(item, bill.people)}</span>
            <span className={`${styles.amount} tabular`}>{formatCents(item.priceCents)}</span>
          </li>
        ))}
      </ul>

      <hr className={styles.divider} />

      <dl className={styles.totals}>
        <TotalRow label="Subtotal" cents={summary.subtotalCents} />
        <TotalRow
          label={charges.taxMode === 'percent' ? `Tax · ${trim(charges.taxPercent)}%` : 'Tax'}
          cents={summary.taxCents}
        />
        <TotalRow
          label={
            charges.tipMode === 'percent'
              ? `Tip · ${trim(charges.tipPercent)}% of the ${
                  charges.tipBasis === 'postTax' ? 'post-tax total' : 'subtotal'
                }`
              : 'Tip'
          }
          cents={summary.tipCents}
        />
      </dl>

      <hr className={styles.divider} />

      <div className={styles.grandTotal}>
        <span className={styles.grandLabel}>Total</span>
        <span className={`${styles.grandValue} tabular`}>{formatCents(summary.totalCents)}</span>
      </div>

      {summary.unassignedItemIds.length > 0 && (
        <p className={styles.note}>
          <Badge tone="warningSolid">Nobody yet</Badge>
          <span>
            {formatCents(summary.unassignedCents)} of items,{' '}
            {formatCents(summary.unclaimedTaxCents)} tax and{' '}
            {formatCents(summary.unclaimedTipCents)} tip are still unclaimed.
          </span>
        </p>
      )}
    </Card>
  );
}

function TotalRow({ label, cents }: { label: string; cents: number }) {
  return (
    <div className={styles.totalRow}>
      <dt className={styles.totalLabel}>{label}</dt>
      <dd className={`${styles.totalValue} tabular`}>{formatCents(cents)}</dd>
    </div>
  );
}

/** "Varun, Sujai · $11.00 each", or the warning when nobody has claimed it. */
function whoHadIt(item: Item, people: { id: string; name: string }[]): string {
  const names = item.assignments
    .map((a) => people.find((p) => p.id === a.personId)?.name)
    .filter((name): name is string => Boolean(name));

  if (names.length === 0) return 'nobody yet';
  if (names.length === 1) return names[0];

  const each = perShareCents(item);
  const list = names.join(', ');
  return each === null ? list : `${list} · ${formatCents(each)} each`;
}

function trim(value: number): string {
  return String(Math.round(value * 100) / 100);
}
