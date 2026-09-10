import styles from './Chevron.module.css';

/**
 * The disclosure arrow on anything that opens in place.
 *
 * Shared so the item row and the summary row can't drift apart — they're the
 * same gesture and should look like it.
 */
export function Chevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      className={[styles.chevron, open ? styles.open : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
