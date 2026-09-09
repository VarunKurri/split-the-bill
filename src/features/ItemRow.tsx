import { useState } from 'react';
import { AvatarStack } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { PersonChip } from '../components/ui/PersonChip';
import { allocate, formatCents } from '../domain/money';
import { perShareCents } from '../domain/split';
import type { Item, Person } from '../domain/types';
import { useBill } from '../state/useBill';
import styles from './ItemsCard.module.css';

interface ItemRowProps {
  item: Item;
}

/**
 * One line of the bill, with an assign tray that opens in place.
 *
 * The row itself is the disclosure control — clicking anywhere on it opens
 * the assignment tray, because "who had this?" is the question you ask of
 * every line, and it shouldn't cost a hunt for a small target.
 */
export function ItemRow({ item }: ItemRowProps) {
  const { dispatch, peopleById } = useBill();
  const [open, setOpen] = useState(false);

  const assignees = item.assignments
    .map((a) => peopleById.get(a.personId))
    .filter((p): p is Person => Boolean(p));

  const unassigned = assignees.length === 0;
  const shared = assignees.length > 1;
  const evenShare = perShareCents(item);

  const rowClass = [styles.row, unassigned ? styles.rowUnassigned : '', open ? styles.rowOpen : '']
    .filter(Boolean)
    .join(' ');

  return (
    <li>
      <div className={rowClass}>
        <button
          type="button"
          className={styles.details}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={`${item.name}, ${formatCents(item.priceCents)}. ${
            unassigned ? 'Unassigned' : `Assigned to ${assignees.map((p) => p.name).join(', ')}`
          }. Change assignment`}
        >
          <span className={styles.name}>{item.name}</span>
          <span className={`${styles.meta} ${unassigned ? styles.metaWarning : ''}`}>
            {unassigned && <Badge tone="warning">Nobody yet</Badge>}
            {shared && <Badge tone="neutral">Shared &times; {assignees.length}</Badge>}
            <span className={styles.metaText}>
              {unassigned
                ? 'Tap to say who had it'
                : shared
                  ? evenShare !== null
                    ? `${formatCents(evenShare)} each`
                    : 'Split unevenly'
                  : assignees[0].name}
            </span>
            <span
              className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
              aria-hidden="true"
            >
              ▾
            </span>
          </span>
        </button>

        <AvatarStack people={assignees} />

        <span className={styles.amount}>{formatCents(item.priceCents)}</span>

        <span className={styles.rowActions}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => dispatch({ type: 'item/remove', itemId: item.id })}
            aria-label={`Remove ${item.name}`}
            title={`Remove ${item.name}`}
          >
            &times;
          </button>
        </span>
      </div>

      {open && <AssignTray item={item} assignees={assignees} />}
    </li>
  );
}

function AssignTray({ item, assignees }: { item: Item; assignees: Person[] }) {
  const { bill, dispatch } = useBill();

  if (bill.people.length === 0) {
    return (
      <div className={styles.tray}>
        <p className={styles.trayEmpty}>
          Add people to the bill first — then you can say who had this.
        </p>
      </div>
    );
  }

  const weights = item.assignments.map((a) => a.weight);
  const shares = allocate(item.priceCents, weights);
  const showWeights = assignees.length > 1;

  return (
    <div className={styles.tray}>
      <div className={styles.trayHeader}>
        <span className={styles.trayLabel}>Who had this?</span>
        <Button
          size="small"
          variant="ghost"
          onClick={() => dispatch({ type: 'item/assignAll', itemId: item.id })}
        >
          Everyone
        </Button>
        <Button
          size="small"
          variant="ghost"
          onClick={() => dispatch({ type: 'item/clearAssignees', itemId: item.id })}
          disabled={assignees.length === 0}
        >
          Clear
        </Button>
      </div>

      <div className={styles.chips}>
        {bill.people.map((person) => {
          const assignment = item.assignments.find((a) => a.personId === person.id);
          return (
            <PersonChip
              key={person.id}
              person={person}
              selected={Boolean(assignment)}
              weight={assignment?.weight}
              onClick={() =>
                dispatch({ type: 'item/toggleAssignee', itemId: item.id, personId: person.id })
              }
            />
          );
        })}
      </div>

      {showWeights && (
        <div className={styles.weights}>
          {item.assignments.map((assignment, index) => {
            const person = bill.people.find((p) => p.id === assignment.personId);
            if (!person) return null;
            return (
              <div className={styles.weightRow} key={assignment.personId}>
                <span className={styles.weightName}>{person.name}</span>
                <span className={styles.stepper}>
                  <button
                    type="button"
                    className={styles.stepperButton}
                    onClick={() =>
                      dispatch({
                        type: 'item/setWeight',
                        itemId: item.id,
                        personId: person.id,
                        weight: assignment.weight - 1,
                      })
                    }
                    disabled={assignment.weight <= 1}
                    aria-label={`Decrease ${person.name}'s share`}
                  >
                    &minus;
                  </button>
                  <span className={styles.stepperValue} aria-live="polite">
                    {assignment.weight}
                  </span>
                  <button
                    type="button"
                    className={styles.stepperButton}
                    onClick={() =>
                      dispatch({
                        type: 'item/setWeight',
                        itemId: item.id,
                        personId: person.id,
                        weight: assignment.weight + 1,
                      })
                    }
                    aria-label={`Increase ${person.name}'s share`}
                  >
                    +
                  </button>
                </span>
                <span className={styles.weightAmount}>{formatCents(shares[index] ?? 0)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
