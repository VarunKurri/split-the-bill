import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { formatCents } from '../domain/money';
import { useBill } from '../state/useBill';
import { ItemRow } from './ItemRow';
import { QuickAddItem } from './QuickAddItem';
import styles from './ItemsCard.module.css';

export function ItemsCard() {
  const { bill, summary, dispatch } = useBill();

  const unassignedCount = summary.unassignedItemIds.length;

  function splitRemainingEvenly() {
    for (const itemId of summary.unassignedItemIds) {
      dispatch({ type: 'item/assignAll', itemId });
    }
  }

  return (
    <Card
      title="Items"
      trailing={
        <span className={`${styles.total} tabular`}>{formatCents(summary.subtotalCents)}</span>
      }
    >
      <QuickAddItem />

      {bill.items.length === 0 ? (
        <p className={styles.empty}>
          Add the first item. You can assign it to people now or once everything is in.
        </p>
      ) : (
        <ul className={styles.list}>
          {bill.items.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      {unassignedCount > 0 && (
        <div className={styles.banner} role="status">
          <span className={styles.bannerText}>
            <strong>
              {unassignedCount} {unassignedCount === 1 ? 'item' : 'items'} unassigned
            </strong>{' '}
            &middot; {formatCents(summary.unassignedCents)} plus{' '}
            {formatCents(summary.unclaimedChargesCents)} of tax and tip is owed by nobody.
          </span>
          {bill.people.length > 0 && (
            <Button size="small" variant="secondary" onClick={splitRemainingEvenly}>
              Split them evenly
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
