import { useState } from 'react';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Field } from '../components/ui/inputs';
import { centsToInput, formatCents, parseCents } from '../domain/money';
import type { ID, Person } from '../domain/types';
import { useBill } from '../state/useBill';
import styles from './PaymentsCard.module.css';

/**
 * Who actually put money down.
 *
 * The rest of the app answers "what does each person owe?"; this answers "and
 * who has already covered it?". Splitting the two matters because at a real
 * table one card usually pays the whole bill and everyone settles with that
 * person afterwards — the amount someone owes and the amount they paid are
 * rarely the same number.
 */
export function PaymentsCard() {
  const { bill, summary, dispatch } = useBill();

  if (bill.people.length === 0) return null;

  const { paidCents, unpaidCents, totalCents, transfers } = summary;
  const covered = totalCents > 0 && unpaidCents === 0;

  return (
    <Card
      title="Who paid?"
      trailing={
        paidCents === 0 ? null : covered ? (
          <Badge tone="success">Covered</Badge>
        ) : (
          <Badge tone="warning">
            {formatCents(Math.abs(unpaidCents))} {unpaidCents > 0 ? 'short' : 'over'}
          </Badge>
        )
      }
    >
      <p className={styles.hint}>
        What each person handed to the restaurant, whatever they ordered. One card covering everyone
        is the usual case.
      </p>

      <ul className={styles.list}>
        {bill.people.map((person) => {
          const breakdown = summary.perPerson.find((p) => p.personId === person.id);
          return (
            <PayerRow
              key={person.id}
              person={person}
              paidCents={breakdown?.paidCents ?? 0}
              netCents={breakdown?.netCents ?? 0}
              onChange={(amountCents) =>
                dispatch({ type: 'payment/set', personId: person.id, amountCents })
              }
            />
          );
        })}
      </ul>

      {totalCents > 0 && (
        <p className={styles.tally}>
          {formatCents(paidCents)} paid of {formatCents(totalCents)}
          {unpaidCents > 0 && ` · ${formatCents(unpaidCents)} still owed`}
          {unpaidCents < 0 && ` · ${formatCents(-unpaidCents)} overpaid`}
        </p>
      )}

      <SettlePlan transfers={transfers} />

      {paidCents > 0 && (
        <div className={styles.actions}>
          <Button
            size="small"
            variant="ghost"
            onClick={() => dispatch({ type: 'payment/clearAll' })}
          >
            Clear payments
          </Button>
        </div>
      )}
    </Card>
  );
}

interface PayerRowProps {
  person: Person;
  paidCents: number;
  netCents: number;
  onChange: (amountCents: number) => void;
}

function PayerRow({ person, paidCents, netCents, onChange }: PayerRowProps) {
  const [draft, setDraft] = useState<string | null>(null);

  // Zero reads better as an empty field than as "0.00" — most people at the
  // table paid nothing, and a column of zeroes is just noise.
  const committed = paidCents === 0 ? '' : centsToInput(paidCents);

  return (
    <li className={styles.row}>
      <Avatar person={person} size="small" />
      <span className={styles.name}>{person.name}</span>

      {netCents !== 0 && paidCents > 0 && (
        <span className={netCents > 0 ? styles.netUp : styles.netDown}>
          {netCents > 0 ? `+${formatCents(netCents)}` : formatCents(netCents)}
        </span>
      )}

      <Field
        className={styles.amountField}
        label={`Amount ${person.name} paid`}
        hideLabel
        numeric
        prefix="$"
        inputMode="decimal"
        placeholder="0.00"
        value={draft ?? committed}
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
    </li>
  );
}

/**
 * The point of recording payments: the shortest list of "A pays B" that makes
 * everyone whole. An empty plan is the good outcome, not a missing feature —
 * it means nobody owes anybody.
 */
function SettlePlan({
  transfers,
}: {
  transfers: { fromPersonId: ID; toPersonId: ID; amountCents: number }[];
}) {
  const { peopleById } = useBill();
  if (transfers.length === 0) return null;

  return (
    <div className={styles.settle}>
      <span className={styles.settleLabel}>Settle up</span>
      <ul className={styles.transfers}>
        {transfers.map((transfer) => {
          const from = peopleById.get(transfer.fromPersonId);
          const to = peopleById.get(transfer.toPersonId);
          if (!from || !to) return null;
          return (
            <li className={styles.transfer} key={`${transfer.fromPersonId}-${transfer.toPersonId}`}>
              <Avatar person={from} size="small" compact />
              <span className={styles.transferText}>
                <strong>{from.name}</strong> pays <strong>{to.name}</strong>
              </span>
              <span className={styles.transferAmount}>{formatCents(transfer.amountCents)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
