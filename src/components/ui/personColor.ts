import type { CSSProperties } from 'react';

const PALETTE_SIZE = 8;

/**
 * Expose a person's palette entry as local custom properties, so component
 * CSS can reference `var(--person)` / `var(--person-soft)` without a class
 * per colour or an inline hex anywhere.
 */
export function personVars(colorIndex: number): CSSProperties {
  const index = ((colorIndex - 1) % PALETTE_SIZE) + 1;
  return {
    '--person': `var(--color-person-${index})`,
    '--person-soft': `var(--color-person-soft-${index})`,
  } as CSSProperties;
}

/** "Alex" -> "AK"; "Bri Rogers" -> "BR". Falls back to "?" for empty names. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
