# Split

Split a restaurant bill by item, with tax and tip shared in proportion to what each
person actually ordered.

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm test         # 46 tests, mostly on the money math
npm run verify   # typecheck + lint + format check + tests
npm run build    # typecheck + production build
```

Husky hooks are installed by `npm install`: pre-commit formats and lints staged
files, pre-push runs the full `verify` suite.

No backend, no accounts, no network calls. The bill lives in `localStorage` so a
refresh mid-dinner doesn't lose it.

---

## What it does

- Add people; each gets a stable colour that means only them, everywhere in the UI.
- Add items from a keyboard-first quick-add row: name, Tab, price, Enter, repeat.
- Assign items by clicking names. Shared plates take any number of people.
- Split a shared plate equally, by share weights, by percentage, or by exact amount —
  and see the resulting amounts as you set them. Switching between them restates the
  same split rather than resetting it.
- Record who actually paid, and get the shortest list of "A pays B" that squares
  everyone up.
- Set tax and tip as a percentage or a flat amount; tip on pre- or post-tax.
- See what everyone owes, live, with the full derivation on demand.
- Copy a plain-text summary for the group chat.

---

## The decisions worth arguing about

The brief is deliberately underspecified. These are the calls I made.

**The friend who only had a salad.** Per-item assignment is the default, and tax and
tip are allocated _in proportion to each person's subtotal_ rather than per head.
Someone who ordered $12 of food does not pay the same tip as someone who ordered $60.
This is the single most common way bill-splitters annoy people, so it is the default
rather than a setting.

**Two people shared an entrée.** An item holds N assignees, each with an integer share
weight. Equal weights are the ordinary even split; unequal weights cover "she had two
thirds of it" without introducing a second concept. The tray shows each person's
resulting amount while you adjust, so the split is legible before you commit to it.

**Cents.** All money is integer cents, and every division goes through
largest-remainder allocation. A $10 plate split three ways is 3.34 / 3.33 / 3.33 —
never 3.33 × 3 with a cent quietly disappearing. Where rounding does move a cent, it
is shown as a `Rounding` line in the person's breakdown, and a reconciliation line
adds the per-person totals back up and checks them against the bill total on every
render.

**Items nobody claimed.** An unassigned item is the only thing that can make the
totals wrong, so it is a first-class state: amber row, persistent banner with the
amount at stake, and — importantly — its share of tax and tip stays _unclaimed_
rather than being silently redistributed onto the people who have already been
assigned. Nobody gets quietly overcharged for a plate nobody has owned up to. There's
a one-click "split them evenly" escape hatch for when you stop caring.

**Not a wizard.** A wizard would force "all the people" before "all the items", which
is the opposite of how a table works — plates and people arrive in whatever order they
arrive. Everything is on one screen, and the rail keeps a live answer to "what do I
owe?" as you go.

**Deletion is undoable.** Removing a person strips their assignments and leaves the
affected items unassigned rather than deleting them. The undo toast dismisses itself
after ten seconds — long enough to look up from the table and still catch it — and
holds open while you hover or focus it, so reaching for Undo never races the timer.

---

## Architecture

```
src/
├── domain/          Pure functions. No React, no DOM.
│   ├── money.ts       cents parsing/formatting, largest-remainder allocation
│   ├── split.ts       calculateSplit(bill) -> BillSummary
│   ├── settle.ts      net positions -> the shortest list of "A pays B"
│   └── types.ts
├── state/           Reducer, persistence, undo
├── components/ui/   Design-system primitives (mirror the Figma component sets)
└── features/        Composed views: TopBar, PeopleCard, ItemsCard, ChargesCard, SummaryCard
```

The whole calculation is one pure function of the bill — `calculateSplit(bill)` — with
no memoisation tricks and no state of its own. That is what makes it testable, and the
tests are where the confidence comes from: parity sweeps assert that per-person totals
reconcile to the bill total across hundreds of awkward price and party-size
combinations.

State is `useReducer` + context. There is no data-fetching, no server state and no
routing, so a state library would be ceremony.

Tooling is ESLint with type-checked rules, Prettier, and husky + lint-staged. The
type-checked rules earn their keep: turning them on surfaced two floating promises in
click handlers and a context module that quietly broke Fast Refresh.

### Design tokens

`src/styles/tokens.css` is generated from the Figma variable collections, and the CSS
custom property names match the Figma variable names 1:1 (`color/bg/canvas` ->
`--color-bg-canvas`). No component hardcodes a colour, spacing value or radius.

Figma file: <https://www.figma.com/design/qWtj3HHYkn9oMfCP1AfjHc> — 146 variables,
16 text styles, 5 effect styles, and 7 component sets (Button, Field, Avatar, Person
Chip, Badge, Item Row, Summary Row).

---

## Testing

46 tests, concentrated where being wrong actually costs something:

- `money.test.ts` — parsing tolerance and strictness, and an exhaustive sweep proving
  allocation never creates or loses a cent.
- `split.test.ts` — the salad-eater case, uneven shares, pre/post-tax tip, unassigned
  items, zero-value items, stale assignments, and reconciliation across a wide sweep
  of prices and party sizes.
- `billReducer.test.ts` — colour recycling, name disambiguation, what happens to items
  when a person is removed, weight clamping, and undo.

There are no component render tests. With an hour of budget, tests on the money math
buy far more confidence per minute than assertions about markup.

---

## What I'd do with another hour

1. **Receipt photo import.** The brief's nice-to-have and the obvious multiplier. The
   domain layer already accepts items from anywhere, so it's an input adapter plus a
   review-and-correct screen, not a rewrite. The model proposes line items; prices are
   re-parsed through `parseCents`, schema-validated, reconciled against the receipt's
   printed total, and confirmed by a human before anything reaches state. The model
   proposes, the deterministic core disposes — nothing unvalidated touches the money.
2. **An eval set for that import.** Ten labelled receipts scored on item-level
   precision/recall and total-match rate. Without it, "the OCR works" is a vibe rather
   than a number, and there's no way to tell whether a prompt change helped.
3. **A shareable link.** Encode the bill in the URL fragment so the summary can be sent
   to the table rather than read aloud. Fragment, not query string — it never reaches a
   server, so it stays backend-free.
4. **An accessibility pass to WCAG 2.1 AA.** The groundwork is there — semantic
   buttons, `aria-pressed` on chips, `aria-expanded` on rows, labels on every input,
   visible focus rings — but it has never been audited. The suspects: contrast on the
   amber warning text over the amber tint, keyboard traversal of the assign tray
   including the steppers, and whether changing totals are announced.
5. **Component tests for the assign tray.** The one piece of UI with enough state to
   deserve them — four split modes, live per-person amounts, and an unbalanced-input
   warning.

---

## AI tools used

Built end to end with **Claude (Cowork)** and **Claude Code**, in two phases:

1. **Design.** Claude drove the Figma MCP server to build the design system directly in
   Figma — variable collections with scopes and code syntax, text and effect styles,
   and seven component sets with variants and component properties. The Figma Starter
   plan's 20-tool-calls-per-month cap was reached before the screen frames were built,
   so the screen specs were captured in writing and the UI was composed in code from
   the same tokens. `src/styles/tokens.css` matches the Figma variable names 1:1, so
   Code Connect can be wired later without renaming anything.
2. **Build.** Claude wrote the application — domain layer, tests, state, components and
   views — iterating rather than one-shotting. The money math was written and tested
   first, then the UI was built on top of it, then rendered in a headless browser and
   screenshotted so layout bugs could be caught visually before commit. That loop is
   what caught centre-aligned item names, clipped avatar initials, an assign tray
   rendering as a detached panel, and a chip labelling a 50% share as "×50".

The iteration was the point, not a fallback. Turning on type-checked ESLint rules
surfaced two real bugs (floating promises in click handlers, a context module breaking
Fast Refresh). Splitting the work into commits surfaced another: the first attempt
produced a commit that didn't compile, so the commits were restructured until each one
built and passed on its own.

I directed the product decisions, reviewed each layer, and chose the trade-offs
documented above. Where Claude proposed something that conflicted with a decision
already made — auto-dismissing the undo toast, adding a serverless proxy the brief had
ruled out — it flagged the conflict rather than quietly doing it, and I made the call.
