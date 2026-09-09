import {
  forwardRef,
  useId,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import styles from './inputs.module.css';

// `size` and `prefix` are both HTML attributes we deliberately repurpose.
type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'>;

interface FieldProps extends BaseProps {
  label?: string;
  /** Rendered inline before the input — the `$` on an amount field. */
  prefix?: ReactNode;
  /** Rendered inline after the input — the `%` on a rate field. */
  suffix?: ReactNode;
  /** Inline error text. Errors live next to the field, never in a toast. */
  error?: string | null;
  numeric?: boolean;
  className?: string;
  hideLabel?: boolean;
}

/**
 * Mirrors the `Field` component set in Figma (Type x State).
 *
 * Amount variants right-align the value and carry the currency as a separate
 * affix, so a column of prices lines up on the decimal point.
 */
/**
 * Characters a money or rate field will accept.
 *
 * This filters the resulting *value* rather than trapping keystrokes, which is
 * what makes it safe: paste, autofill, undo and IME input all go through
 * `onChange` too, so a keydown guard would block the keyboard while letting a
 * pasted "abc" straight through. Rejecting the value instead covers every
 * route in, and a rejected change simply never reaches state — the character
 * doesn't appear.
 *
 * `$`, `,` and spaces stay allowed because `parseCents` already tolerates them
 * and pasting "$1,234.50" should work. `-` is not: nothing in this app is
 * negative money.
 */
function acceptsNumericDraft(value: string): boolean {
  if (!/^[\d$%,.\s]*$/.test(value)) return false;
  return (value.match(/\./g)?.length ?? 0) <= 1;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, prefix, suffix, error, numeric = false, className, hideLabel = false, ...rest },
  ref,
) {
  const generatedId = useId();
  const id = rest.id ?? generatedId;
  const errorId = `${id}-error`;

  const { onChange } = rest;
  const handleChange = onChange
    ? (event: ChangeEvent<HTMLInputElement>) => {
        if (numeric && !acceptsNumericDraft(event.target.value)) return;
        onChange(event);
      }
    : undefined;

  return (
    <div className={[styles.field, className ?? ''].filter(Boolean).join(' ')}>
      {label && (
        <label className={hideLabel ? 'visually-hidden' : styles.label} htmlFor={id}>
          {label}
        </label>
      )}
      <div className={[styles.control, error ? styles.invalid : ''].filter(Boolean).join(' ')}>
        {prefix && <span className={styles.affix}>{prefix}</span>}
        <input
          {...rest}
          onChange={handleChange}
          id={id}
          ref={ref}
          className={[styles.input, numeric ? styles.numeric : ''].filter(Boolean).join(' ')}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : rest['aria-describedby']}
        />
        {suffix && <span className={styles.affix}>{suffix}</span>}
      </div>
      {error && (
        <span className={styles.helper} id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
});
