/**
 * Characters a money or rate field will accept while it is being typed.
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
 *
 * Lives in its own module rather than beside `Field` because a module that
 * exports both a component and a plain function breaks React Fast Refresh, and
 * `react-refresh/only-export-components` fails the build over it.
 */
export function acceptsNumericDraft(value: string): boolean {
  if (!/^[\d$%,.\s]*$/.test(value)) return false;
  return (value.match(/\./g)?.length ?? 0) <= 1;
}
