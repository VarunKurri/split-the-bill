import { useBill } from '../state/useBill';
import styles from './UndoToast.module.css';

/**
 * Deletion is the only irreversible thing in the app, so it gets a way back.
 * The toast stays until the next action rather than timing out — at a table,
 * you might not look at the screen for a minute.
 */
export function UndoToast() {
  const { undoLabel, dispatch } = useBill();
  if (!undoLabel) return null;

  return (
    <div className={styles.toast} role="status">
      <span>{undoLabel}</span>
      <button type="button" className={styles.action} onClick={() => dispatch({ type: 'undo' })}>
        Undo
      </button>
    </div>
  );
}
