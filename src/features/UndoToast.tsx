import { useEffect, useState } from 'react';
import { useBill } from '../state/useBill';
import styles from './UndoToast.module.css';

/**
 * Ten seconds: long enough to look up from the table and still catch it, short
 * enough that it doesn't sit there looking like part of the furniture.
 */
const DISMISS_AFTER_MS = 10_000;

/**
 * Deletion is the only irreversible thing in the app, so it gets a way back.
 *
 * The toast dismisses itself after a pause, and hovering or focusing it holds
 * it open — so reaching for Undo never races the timer. The undo itself stays
 * available in state either way; dismissing only hides the prompt.
 */
export function UndoToast() {
  const { undoLabel, dispatch } = useBill();
  const [dismissed, setDismissed] = useState(false);
  const [held, setHeld] = useState(false);

  // A new action means a new toast, so the countdown starts over.
  useEffect(() => {
    setDismissed(false);
  }, [undoLabel]);

  useEffect(() => {
    if (!undoLabel || held || dismissed) return;
    const timer = setTimeout(() => setDismissed(true), DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [undoLabel, held, dismissed]);

  if (!undoLabel || dismissed) return null;

  return (
    <div
      className={styles.toast}
      role="status"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <span>{undoLabel}</span>
      <button type="button" className={styles.action} onClick={() => dispatch({ type: 'undo' })}>
        Undo
      </button>
    </div>
  );
}
