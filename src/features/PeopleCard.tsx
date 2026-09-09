import { useRef, useState, type FormEvent } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Field } from '../components/ui/inputs';
import { PersonChip } from '../components/ui/PersonChip';
import { useBill } from '../state/useBill';
import styles from './PeopleCard.module.css';

export function PeopleCard() {
  const { bill, dispatch } = useBill();
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    dispatch({ type: 'person/add', name });
    setName('');
    // Keep the cursor where it was: adding four people should be four
    // names and four Enters, with no reaching for the mouse.
    inputRef.current?.focus();
  }

  return (
    <Card
      title="People"
      trailing={<span className={styles.hint}>A colour means one person, everywhere</span>}
    >
      {bill.people.length === 0 && (
        <p className={styles.empty}>
          Add everyone at the table. You can assign items as the plates arrive.
        </p>
      )}

      <div className={styles.row}>
        {bill.people.map((person) => (
          <span key={person.id} className={styles.personWrap}>
            <PersonChip person={person} selected interactive={false} />
            <button
              type="button"
              className={styles.remove}
              onClick={() => dispatch({ type: 'person/remove', personId: person.id })}
              aria-label={`Remove ${person.name}`}
              title={`Remove ${person.name}`}
            >
              &times;
            </button>
          </span>
        ))}
      </div>

      <form className={styles.addForm} onSubmit={submit}>
        <Field
          ref={inputRef}
          label="Add person"
          hideLabel
          className={styles.addInput}
          placeholder="Add a name…"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
        />
        <Button variant="secondary" type="submit" disabled={!name.trim()}>
          Add
        </Button>
      </form>
    </Card>
  );
}
