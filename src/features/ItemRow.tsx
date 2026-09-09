import { useState } from 'react';
import { AvatarStack } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { PersonChip } from '../components/ui/PersonChip';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Field } from '../components/ui/inputs';
import { allocate, centsToInput, formatCents, parseCents, parsePercent } from '../domain/money';
import { amountGapCents, perShareCents, splitIsBalanced, weightTotal } from '../domain/split';
import type { Item, Person, SplitMode } from '../domain/types';
import { useBill } from '../state/useBill';
import styles from './ItemsCard.module.css';

const SPLIT_MODES: { value: SplitMode; label: string }[] = [
  { value: 'equal', label: 'Equally' },
  { value: 'shares', label: 'Shares' },
  { value: 'percent', label: 'Percent' },
  { value: 'amount', label: 'Amount' },
];

/** `33.33` -> `"33.33"`, `20` -> `"20"`. Trailing zeros are noise in a field. */
function trimPercent(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * The suffix on a person's chip. A bare "x50" on a percentage split reads as
 * fifty shares, which is the opposite of what it means, so percent items say
 * "50%" and share items keep the multiplier.
 */
function weightLabel(item: Item, weight: number | undefined): string | null {
  if (weight == null) return null;
  if (item.splitMode === 'percent') return `${trimPercent(weight)}%`;
  if (item.splitMode === 'amount') return formatCents(weight);
  return weight > 1 ? `×${weight}` : null;
}

/** The one-line "how is this being split" hint on a collapsed row. */
function summaryText(item: Item, assignees: Person[], evenShare: number | null): string {
  if (assignees.length === 0) return 'Tap to say who had it';
  if (assignees.length === 1) return assignees[0].name;
  if (item.splitMode === 'percent') return 'By percentage';
  if (item.splitMode === 'amount') return 'By amount';
  if (evenShare !== null) return `${formatCents(evenShare)} each`;
  return 'Split unevenly';
}

interface PercentFieldProps {
  value: number;
  label: string;
  onChange: (percent: number) => void;
}

/**
 * A percentage input that keeps what you typed while you're typing it.
 *
 * Driving the value straight from the store rewrites "33." to "33" on the
 * keystroke after the decimal point, which makes fractional percentages
 * impossible to enter. The draft lives here and only valid values are
 * committed; blur hands control back to the store.
 */
function PercentField({ value, label, onChange }: PercentFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <Field
      className={styles.percentField}
      label={label}
      hideLabel
      numeric
      suffix="%"
      inputMode="decimal"
      value={draft ?? trimPercent(value)}
      onChange={(event) => {
        setDraft(event.target.value);
        const parsed = parsePercent(event.target.value);
        if (parsed !== null) onChange(parsed);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

interface AmountFieldProps {
  value: number;
  label: string;
  onChange: (amountCents: number) => void;
}

/** The money twin of `PercentField`, with the same keep-the-draft behaviour. */
function AmountField({ value, label, onChange }: AmountFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <Field
      className={styles.percentField}
      label={label}
      hideLabel
      numeric
      prefix="$"
      inputMode="decimal"
      value={draft ?? centsToInput(value)}
      onChange={(event) => {
        setDraft(event.target.value);
        if (event.target.value.trim() === '') {
          onChange(0);
          return;
        }
        const parsed = parseCents(event.target.value);
        if (parsed !== null) onChange(parsed);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

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
            {unassigned && <Badge tone="warningSolid">Nobody yet</Badge>}
            {shared && <Badge tone="neutral">Shared &times; {assignees.length}</Badge>}
            <span className={styles.metaText}>{summaryText(item, assignees, evenShare)}</span>
            <svg
              className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
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
          Add people to the bill first, then you can say who had this.
        </p>
      </div>
    );
  }

  const weights = item.assignments.map((a) => a.weight);
  const shares = allocate(item.priceCents, weights);
  const showWeights = assignees.length > 1;
  const percentMode = item.splitMode === 'percent';
  const amountMode = item.splitMode === 'amount';
  const unbalanced = !splitIsBalanced(item);

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
              weightLabel={weightLabel(item, assignment?.weight)}
              onClick={() =>
                dispatch({ type: 'item/toggleAssignee', itemId: item.id, personId: person.id })
              }
            />
          );
        })}
      </div>

      {showWeights && (
        <>
          <div className={styles.modeRow}>
            <span className={styles.trayLabel}>Split</span>
            <SegmentedControl
              options={SPLIT_MODES}
              value={item.splitMode}
              onChange={(mode) => dispatch({ type: 'item/setSplitMode', itemId: item.id, mode })}
              label={`How to split ${item.name}`}
            />
          </div>

          <div className={styles.weights}>
            {item.assignments.map((assignment, index) => {
              const person = bill.people.find((p) => p.id === assignment.personId);
              if (!person) return null;
              return (
                <div className={styles.weightRow} key={assignment.personId}>
                  <span className={styles.weightName}>{person.name}</span>

                  {item.splitMode === 'shares' && (
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
                  )}

                  {percentMode && (
                    <PercentField
                      value={assignment.weight}
                      label={`${person.name}'s percentage of ${item.name}`}
                      onChange={(percent) =>
                        dispatch({
                          type: 'item/setPercent',
                          itemId: item.id,
                          personId: person.id,
                          percent,
                        })
                      }
                    />
                  )}

                  {amountMode && (
                    <AmountField
                      value={assignment.weight}
                      label={`${person.name}'s share of ${item.name} in dollars`}
                      onChange={(amountCents) =>
                        dispatch({
                          type: 'item/setAmount',
                          itemId: item.id,
                          personId: person.id,
                          amountCents,
                        })
                      }
                    />
                  )}

                  <span className={styles.weightAmount}>{formatCents(shares[index] ?? 0)}</span>
                </div>
              );
            })}

            {unbalanced && (
              <p className={styles.percentWarning} role="status">
                {percentMode
                  ? `Percentages add up to ${trimPercent(weightTotal(item))}%, not 100.`
                  : amountGapCents(item) > 0
                    ? `${formatCents(amountGapCents(item))} of this item is still unassigned.`
                    : `Amounts exceed the item by ${formatCents(-amountGapCents(item))}.`}{' '}
                It is still split in proportion to what you entered.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
