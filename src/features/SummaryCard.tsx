import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Chevron } from '../components/ui/Chevron';
import { formatCents } from '../domain/money';
import type { PersonBreakdown, Person } from '../domain/types';
import { useBill } from '../state/useBill';
import { useShareSummary } from './useShareSummary';
import styles from './SummaryCard.module.css';

export function SummaryCard() {
  const { bill, summary, dispatch } = useBill();
  const [openPersonId, setOpenPersonId] = useState<string | null>(null);
  const { share, copied } = useShareSummary();

  if (bill.people.length === 0) {
    return (
      <Card title="Everyone Owes">
        <p className={styles.empty}>
          Add people and they'll show up here with a running total as you assign items.
        </p>
      </Card>
    );
  }

  return (
    <Card
      title="Everyone Owes"
      trailing={
        summary.unassignedItemIds.length > 0 ? (
          <Badge tone="warning">{summary.unassignedItemIds.length} unassigned</Badge>
        ) : summary.subtotalCents > 0 ? (
          <Badge tone="success">All assigned</Badge>
        ) : null
      }
    >
      <ul className={styles.list}>
        {bill.people.map((person) => {
          const breakdown = summary.perPerson.find((p) => p.personId === person.id);
          if (!breakdown) return null;
          return (
            <PersonSummary
              key={person.id}
              person={person}
              breakdown={breakdown}
              settled={bill.settledPersonIds.includes(person.id)}
              open={openPersonId === person.id}
              onToggle={() => setOpenPersonId((id) => (id === person.id ? null : person.id))}
              onToggleSettled={() =>
                dispatch({ type: 'person/toggleSettled', personId: person.id })
              }
            />
          );
        })}
      </ul>

      <Button variant="primary" fullWidth onClick={share} disabled={summary.totalCents === 0}>
        {copied ? 'Copied to clipboard' : 'Copy summary'}
      </Button>

      <ReconciliationNote />
    </Card>
  );
}

interface PersonSummaryProps {
  person: Person;
  breakdown: PersonBreakdown;
  settled: boolean;
  open: boolean;
  onToggle: () => void;
  onToggleSettled: () => void;
}

/**
 * Mirrors the `Summary Row` component set in Figma.
 *
 * Expanding shows the whole derivation — each item share, the proportional
 * tax and tip, and any rounding adjustment — so nobody has to take a single
 * number on faith.
 */
function PersonSummary({
  person,
  breakdown,
  settled,
  open,
  onToggle,
  onToggleSettled,
}: PersonSummaryProps) {
  const sharedCount = breakdown.lines.filter((line) => line.shareLabel !== 'full').length;
  const itemCount = breakdown.lines.length;
  const rowRef = useRef<HTMLLIElement>(null);

  /*
   * "Everyone Owes" is the last card on the page, so on a phone you are
   * usually scrolled to the bottom when you tap a name. The panel opens
   * downward, the page grows, and the browser holds the scroll position — so
   * everything appears to jump upward and the thing you just opened is off
   * screen. Pulling the row back into view is what makes it read as opening
   * downward, which is what it is actually doing.
   */
  useEffect(() => {
    if (!open) return;
    rowRef.current?.scrollIntoView({
      block: 'nearest',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [open]);

  const meta = settled
    ? 'Settled up'
    : itemCount === 0
      ? 'Nothing assigned yet'
      : `${itemCount} ${itemCount === 1 ? 'item' : 'items'}${
          sharedCount > 0 ? ` · ${sharedCount} shared` : ''
        }`;

  return (
    <li
      ref={rowRef}
      className={[styles.person, open ? styles.personOpen : '', settled ? styles.personSettled : '']
        .filter(Boolean)
        .join(' ')}
    >
      <button type="button" className={styles.head} onClick={onToggle} aria-expanded={open}>
        <Avatar person={person} size="medium" />
        <span className={styles.identity}>
          <span className={styles.name}>{person.name}</span>
          <span className={`${styles.meta} ${settled ? styles.metaSettled : ''}`}>{meta}</span>
        </span>
        <span className={`${styles.total} ${settled ? styles.totalSettled : ''}`}>
          {formatCents(breakdown.totalCents)}
        </span>
        <Chevron open={open} />
      </button>

      {open && (
        <div className={styles.breakdown}>
          <hr className={styles.divider} />

          {breakdown.lines.length > 0 ? (
            <div className={styles.lines}>
              {breakdown.lines.map((line) => (
                <div className={styles.line} key={line.itemId}>
                  <span className={styles.lineLabel}>
                    {line.itemName}
                    {line.shareLabel !== 'full' && (
                      <span className={styles.share}>{line.shareLabel}</span>
                    )}
                  </span>
                  <span className={styles.lineValue}>{formatCents(line.amountCents)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>No items assigned yet.</p>
          )}

          <hr className={styles.divider} />

          <div className={styles.lines}>
            <BreakdownLine label="Subtotal" cents={breakdown.subtotalCents} />
            <BreakdownLine label="Tax · their share" cents={breakdown.taxCents} />
            <BreakdownLine label="Tip · their share" cents={breakdown.tipCents} />
            {breakdown.roundingCents !== 0 && (
              <BreakdownLine label="Rounding" cents={breakdown.roundingCents} />
            )}
          </div>

          <div className={styles.actions}>
            {/*
              Always `secondary`. Ghost on the settled card's green tint left
              the button all but invisible, and its grey hover fought the green.
            */}
            <Button size="small" variant="secondary" onClick={onToggleSettled}>
              {settled ? 'Mark unpaid' : 'Mark settled'}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function BreakdownLine({ label, cents }: { label: string; cents: number }) {
  return (
    <div className={styles.line}>
      <span className={`${styles.lineLabel} ${styles.lineMuted}`}>{label}</span>
      <span className={`${styles.lineValue} ${styles.lineValueMuted}`}>{formatCents(cents)}</span>
    </div>
  );
}

/**
 * Proof, not a promise: the per-person totals plus anything still unclaimed
 * are added back up and checked against the bill total on every render.
 */
function ReconciliationNote() {
  const { summary } = useBill();
  if (summary.totalCents === 0) return null;

  const claimed = summary.perPerson.reduce((total, p) => total + p.totalCents, 0);
  const unclaimed = summary.unassignedCents + summary.unclaimedChargesCents;

  return (
    <p className={`${styles.reconcile} ${summary.reconciles ? '' : styles.reconcileBad}`}>
      {summary.reconciles ? '✓' : '!'} {formatCents(claimed)}
      {unclaimed > 0 && ` + ${formatCents(unclaimed)} unclaimed`} ={' '}
      {formatCents(summary.totalCents)}
    </p>
  );
}
