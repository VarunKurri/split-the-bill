import { useBill } from '../state/useBill';
import styles from './PersistenceNotice.module.css';

export function PersistenceNotice() {
  const { persistenceWarning, dismissPersistenceWarning } = useBill();
  if (!persistenceWarning) return null;

  return (
    <div className={styles.notice} role="alert">
      <span>{persistenceWarning}</span>
      <button
        type="button"
        className={styles.dismiss}
        onClick={dismissPersistenceWarning}
        aria-label="Dismiss storage warning"
      >
        &times;
      </button>
    </div>
  );
}
