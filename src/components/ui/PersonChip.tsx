import type { Person } from '../../domain/types';
import { initials, personVars } from './personColor';
import styles from './PersonChip.module.css';

interface PersonChipProps {
  person: Person;
  selected?: boolean;
  size?: 'medium' | 'small';
  /** Shown as a "x2" suffix when this person's share of an item is weighted. */
  weight?: number;
  onClick?: () => void;
  /** Rendered as static markup rather than a button when there's nothing to toggle. */
  interactive?: boolean;
}

/**
 * Mirrors the `Person Chip` component set in Figma.
 *
 * The whole chip is the hit target, and it is at least 28px tall, because
 * assigning an item should be one click at a noisy table — not a dropdown.
 */
export function PersonChip({
  person,
  selected = false,
  size = 'medium',
  weight,
  onClick,
  interactive = true,
}: PersonChipProps) {
  const className = [styles.chip, selected ? styles.on : '', size === 'small' ? styles.small : '']
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      <span className={styles.dot} aria-hidden="true">
        {initials(person.name)}
      </span>
      <span className={styles.name}>{person.name}</span>
      {selected && weight != null && weight > 1 && (
        <span className={styles.weight}>&times;{weight}</span>
      )}
    </>
  );

  if (!interactive) {
    return (
      <span className={className} style={personVars(person.colorIndex)}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={className}
      style={personVars(person.colorIndex)}
      onClick={onClick}
      aria-pressed={selected}
    >
      {content}
    </button>
  );
}
