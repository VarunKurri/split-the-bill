import { useRef, useState, type FormEvent } from 'react';
import { Button } from '../components/ui/Button';
import { Field } from '../components/ui/inputs';
import { parseCents } from '../domain/money';
import { useBill } from '../state/BillContext';
import styles from './ItemsCard.module.css';

/**
 * The fastest path from a receipt to a total is typing, so this row is built
 * around the keyboard: name, Tab, price, Enter — and focus returns to the
 * name field for the next line without touching the mouse.
 */
export function QuickAddItem() {
  const { bill, dispatch } = useBill();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [shareWithAll, setShareWithAll] = useState(false);
  const [touched, setTouched] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const priceCents = parseCents(price);
  const priceInvalid = touched && price.trim() !== '' && priceCents === null;
  const canSubmit = name.trim() !== '' && priceCents !== null;

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!canSubmit) return;

    dispatch({
      type: 'item/add',
      name,
      priceCents,
      assignToAll: shareWithAll && bill.people.length > 0,
    });
    setName('');
    setPrice('');
    setTouched(false);
    nameRef.current?.focus();
  }

  return (
    <form className={styles.quickAdd} onSubmit={submit}>
      <Field
        ref={nameRef}
        label="Item"
        hideLabel
        className={styles.nameField}
        placeholder="What was on the bill?"
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoComplete="off"
      />
      <Field
        label="Price"
        hideLabel
        className={styles.priceField}
        placeholder="0.00"
        prefix="$"
        numeric
        inputMode="decimal"
        value={price}
        onChange={(event) => setPrice(event.target.value)}
        onBlur={() => setTouched(true)}
        error={priceInvalid ? 'Enter an amount' : null}
        autoComplete="off"
      />
      <div className={styles.quickAddActions}>
        {bill.people.length > 1 && (
          <label className={styles.shareToggle}>
            <input
              type="checkbox"
              checked={shareWithAll}
              onChange={(event) => setShareWithAll(event.target.checked)}
            />
            Shared by all
          </label>
        )}
        <Button variant="primary" type="submit" disabled={!canSubmit}>
          Add item
        </Button>
      </div>
    </form>
  );
}
