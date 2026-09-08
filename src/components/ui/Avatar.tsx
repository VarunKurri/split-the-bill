import type { Person } from '../../domain/types';
import { initials, personVars } from './personColor';
import styles from './Avatar.module.css';

type Size = 'large' | 'medium' | 'small';

interface AvatarProps {
  person: Person;
  size?: Size;
  title?: string;
}

/** Mirrors the `Avatar` component set in Figma. */
export function Avatar({ person, size = 'medium', title }: AvatarProps) {
  return (
    <span
      className={`${styles.avatar} ${styles[size]}`}
      style={personVars(person.colorIndex)}
      title={title ?? person.name}
      aria-hidden="true"
    >
      {initials(person.name)}
    </span>
  );
}

interface AvatarStackProps {
  people: Person[];
  max?: number;
  size?: Size;
}

/**
 * The assignee stack on an item row. Caps at `max` faces and counts the rest,
 * so a table of eight people doesn't turn every row into a mosaic.
 */
export function AvatarStack({ people, max = 3, size = 'small' }: AvatarStackProps) {
  if (people.length === 0) {
    return <span className={styles.empty} aria-hidden="true" />;
  }

  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;

  return (
    <span className={styles.stack} aria-label={people.map((p) => p.name).join(', ')} role="img">
      {shown.map((person) => (
        <Avatar key={person.id} person={person} size={size} />
      ))}
      {overflow > 0 && (
        <span className={`${styles.avatar} ${styles[size]} ${styles.overflow}`} aria-hidden="true">
          +{overflow}
        </span>
      )}
    </span>
  );
}
