import type { ReactNode } from 'react';
import styles from './Badge.module.css';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'warningSolid' | 'danger';

/**
 * Mirrors the `Badge` component set in Figma. `warning` is reserved for
 * unassigned items — the one condition that can make the totals wrong —
 * with `warningSolid` for badges sitting on an already-tinted warning row.
 */
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
