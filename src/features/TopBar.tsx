import { Button } from '../components/ui/Button';
import { useBill } from '../state/BillContext';
import { useShareSummary } from './useShareSummary';
import styles from './TopBar.module.css';

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

export function TopBar() {
  const { bill, dispatch } = useBill();
  const { share, copied } = useShareSummary();

  const headcount = bill.people.length;
  const meta = [
    DATE_FORMAT.format(new Date(bill.createdAt)),
    `${headcount} ${headcount === 1 ? 'person' : 'people'}`,
  ].join(' · ');

  const hasContent = bill.people.length > 0 || bill.items.length > 0;

  return (
    <header className={styles.bar}>
      <span className={styles.mark} aria-hidden="true">
        S
      </span>
      <h1 className={styles.wordmark}>Split</h1>
      <span className={styles.divider} aria-hidden="true">
        /
      </span>

      <label className="visually-hidden" htmlFor="bill-name">
        Bill name
      </label>
      <input
        id="bill-name"
        className={styles.nameInput}
        value={bill.name}
        onChange={(event) => dispatch({ type: 'bill/rename', name: event.target.value })}
        onBlur={(event) => {
          if (!event.target.value.trim()) dispatch({ type: 'bill/rename', name: 'Dinner' });
        }}
        placeholder="Name this bill"
        size={Math.max(bill.name.length, 8)}
      />

      <span className={styles.meta}>{meta}</span>

      <div className={styles.actions}>
        <Button
          variant="ghost"
          size="small"
          onClick={() => dispatch({ type: 'bill/reset' })}
          disabled={!hasContent}
        >
          Start over
        </Button>
        <Button variant="secondary" size="small" onClick={share} disabled={headcount === 0}>
          {copied ? 'Copied' : 'Share summary'}
        </Button>
      </div>
    </header>
  );
}
