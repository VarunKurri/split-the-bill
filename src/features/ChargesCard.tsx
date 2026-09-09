import { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Field } from '../components/ui/inputs';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { centsToInput, formatCents, parseCents, parsePercent } from '../domain/money';
import { useBill } from '../state/useBill';
import styles from './ChargesCard.module.css';

const TIP_PRESETS = [15, 18, 20, 25];

export function ChargesCard() {
  const { bill, summary, dispatch } = useBill();
  const { charges } = bill;

  return (
    <Card title="Tax &amp; tip">
      <div className={styles.line}>
        <span className={styles.lineLabel}>Subtotal</span>
        <span className={styles.lineValue}>{formatCents(summary.subtotalCents)}</span>
      </div>

      <RateControl
        label="Tax"
        mode={charges.taxMode}
        percent={charges.taxPercent}
        cents={charges.taxCents}
        derivedCents={summary.taxCents}
        onModeChange={(taxMode) => dispatch({ type: 'charges/set', patch: { taxMode } })}
        onPercentChange={(taxPercent) => dispatch({ type: 'charges/set', patch: { taxPercent } })}
        onCentsChange={(taxCents) => dispatch({ type: 'charges/set', patch: { taxCents } })}
      />

      <RateControl
        label="Tip"
        mode={charges.tipMode}
        percent={charges.tipPercent}
        cents={charges.tipCents}
        derivedCents={summary.tipCents}
        presets={TIP_PRESETS}
        onModeChange={(tipMode) => dispatch({ type: 'charges/set', patch: { tipMode } })}
        onPercentChange={(tipPercent) => dispatch({ type: 'charges/set', patch: { tipPercent } })}
        onCentsChange={(tipCents) => dispatch({ type: 'charges/set', patch: { tipCents } })}
        footer={
          charges.tipMode === 'percent' ? (
            <label className={styles.basisToggle}>
              <input
                type="checkbox"
                checked={charges.tipBasis === 'postTax'}
                onChange={(event) =>
                  dispatch({
                    type: 'charges/setTipBasis',
                    basis: event.target.checked ? 'postTax' : 'preTax',
                  })
                }
              />
              Tip on the post-tax total
            </label>
          ) : null
        }
      />

      <hr className={styles.divider} />

      <div className={styles.totalRow}>
        <span className={styles.totalLabel}>Total</span>
        <span className={styles.totalValue}>{formatCents(summary.totalCents)}</span>
      </div>
    </Card>
  );
}

interface RateControlProps {
  label: string;
  mode: 'percent' | 'amount';
  percent: number;
  cents: number;
  derivedCents: number;
  presets?: number[];
  onModeChange: (mode: 'percent' | 'amount') => void;
  onPercentChange: (percent: number) => void;
  onCentsChange: (cents: number) => void;
  footer?: React.ReactNode;
}

/**
 * Tax and tip share one control: enter a rate or a flat amount, and see the
 * derived figure immediately. Restaurants print both, so the app accepts both
 * rather than making you do the arithmetic on the way in.
 */
function RateControl({
  label,
  mode,
  percent,
  cents,
  derivedCents,
  presets,
  onModeChange,
  onPercentChange,
  onCentsChange,
  footer,
}: RateControlProps) {
  const [percentDraft, setPercentDraft] = useState(String(percent));
  const [amountDraft, setAmountDraft] = useState(centsToInput(cents));
  const [percentError, setPercentError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);

  function commitPercent(value: string) {
    setPercentDraft(value);
    const parsed = parsePercent(value);
    if (parsed === null) {
      setPercentError(value.trim() === '' ? null : 'Enter 0–100');
      return;
    }
    setPercentError(null);
    onPercentChange(parsed);
  }

  function commitAmount(value: string) {
    setAmountDraft(value);
    const parsed = parseCents(value);
    if (parsed === null) {
      setAmountError(value.trim() === '' ? null : 'Enter an amount');
      return;
    }
    setAmountError(null);
    onCentsChange(parsed);
  }

  return (
    <div className={styles.control}>
      <div className={styles.controlHead}>
        <span className={styles.controlLabel}>{label}</span>
        <SegmentedControl
          label={`${label} entry mode`}
          value={mode}
          onChange={onModeChange}
          options={[
            { value: 'percent' as const, label: '%' },
            { value: 'amount' as const, label: '$' },
          ]}
        />
      </div>

      {mode === 'percent' ? (
        <>
          {presets && (
            <SegmentedControl
              label={`${label} presets`}
              value={presets.includes(percent) ? percent : null}
              onChange={(value) => {
                setPercentDraft(String(value));
                setPercentError(null);
                onPercentChange(value);
              }}
              options={presets.map((value) => ({ value, label: `${value}%` }))}
              fill
            />
          )}
          <div className={styles.controlRow}>
            <Field
              label={`${label} rate`}
              hideLabel
              className={styles.rateField}
              suffix="%"
              numeric
              inputMode="decimal"
              value={percentDraft}
              onChange={(event) => commitPercent(event.target.value)}
              error={percentError}
            />
            <span className={styles.derived}>{formatCents(derivedCents)}</span>
          </div>
        </>
      ) : (
        <div className={styles.controlRow}>
          <Field
            label={`${label} amount`}
            hideLabel
            className={styles.rateField}
            prefix="$"
            numeric
            inputMode="decimal"
            value={amountDraft}
            onChange={(event) => commitAmount(event.target.value)}
            error={amountError}
          />
          <span className={styles.derived}>{formatCents(derivedCents)}</span>
        </div>
      )}

      {footer}
    </div>
  );
}
