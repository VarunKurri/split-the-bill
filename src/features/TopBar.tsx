import { Button } from '../components/ui/Button';
import { useBill } from '../state/useBill';
import { useTheme } from '../state/useTheme';
import { useShareSummary } from './useShareSummary';
import styles from './TopBar.module.css';

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/* Inline rather than an icon dependency: two glyphs don't earn a package. */
function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41" />
    </svg>
  );
}

export function TopBar() {
  const { bill, dispatch } = useBill();
  const { share, copied } = useShareSummary();
  const { theme, toggle } = useTheme();

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
        <button
          type="button"
          className={styles.themeToggle}
          onClick={toggle}
          aria-pressed={theme === 'dark'}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
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
