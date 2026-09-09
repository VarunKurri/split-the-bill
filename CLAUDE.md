# Working in this repo

Context for Claude Code picking this up. Read `README.md` first for the product
reasoning; this file covers how to work in the code without breaking its invariants.

## What this is

A client-side bill splitter, built for the Twin Health take-home. Vite + React 19 +
TypeScript + CSS Modules. No backend, no router, no state library, no CSS framework.
Keep it that way unless there's a concrete reason.

## Commands

```bash
npm run dev          # dev server on :5173
npm test             # vitest, run once
npm run test:watch
npm run typecheck    # tsc -b --noEmit
npm run lint         # eslint (type-checked rules)
npm run format       # prettier --write .
npm run verify       # typecheck + lint + format:check + test
npm run build        # typecheck + production build
```

`npm run verify` is the gate. Run it before you push; the pre-push hook runs the
same checks anyway, so finding out early is just faster.

## Git hooks

Husky, installed by `npm install` via the `prepare` script. Two gates, split by cost:

- **pre-commit** — `lint-staged` runs `eslint --fix` and `prettier --write` on staged
  files only. Cheap, so committing stays cheap.
- **pre-push** — `typecheck`, `lint`, `test` across the whole project.

Don't use `--no-verify` to get around a failing hook. If a rule is wrong, change the
rule in `eslint.config.js` and say why in the commit; a bypassed hook is invisible to
the next person.

`noUnusedLocals` is on, so dead imports break the build rather than lingering. ESLint
uses type-checked rules, which means new files must be inside `tsconfig.app.json`'s
`include` or the linter will refuse them.

## Invariants — don't break these

1. **Money is integer cents.** Never store or compute currency as a float. Parse with
   `parseCents`, display with `formatCents`. If you find yourself writing `* 0.01` or
   `toFixed` outside `money.ts`, something has gone wrong.

2. **Every division of money goes through `allocate()`.** It uses largest-remainder
   and is guaranteed to sum to exactly the input. Splitting by hand with `/ n` will
   lose cents and break reconciliation.

3. **`calculateSplit(bill)` is pure and is the only place totals are computed.** No
   component should do arithmetic on money beyond reading fields off `BillSummary`.
   If a view needs a new number, add it to the summary and test it.

4. **Reconciliation must hold.** `Σ person totals + unassigned + unclaimed charges === bill total`,
   always. `split.test.ts` sweeps this across many price and party-size combinations.
   If you change the allocation model, that sweep is the thing that has to stay green.

5. **Unassigned items keep their tax and tip unclaimed.** They participate in the
   proportional allocation as a phantom claimant (the final entry in `chargeWeights`).
   Do not "simplify" this by allocating only across real people — that silently
   overcharges everyone for items nobody claimed.

6. **No hardcoded design values.** Colours, spacing, radii, type sizes and shadows all
   come from `src/styles/tokens.css`, whose names match the Figma variables 1:1. Add a
   token rather than a literal, and if you add one, add it in Figma too.

7. **Split modes are an editing affordance, not a second allocation model.** `equal`,
   `shares`, `percent` and `amount` all resolve to the same weight vector, which is what
   `allocate()` divides. Percentages are weights that add to 100; amounts are weights
   that add to the item price. When they _don't_ add up, the item is still allocated in
   full, proportionally, and the UI warns — the arithmetic is never conditional on the
   user's input being tidy. Switching modes restates the split rather than resetting it.
   Don't add a mode that computes amounts outside `allocate()`.

8. **What someone owes and what they paid are different numbers.** Payments live on the
   bill, never folded into the split. `netCents = paid - owed`, and `settle()` turns
   those into transfers. A shortfall stays reported as `unpaidCents` rather than being
   absorbed into somebody's share — the same refusal-to-silently-redistribute as
   invariant 5.

## Layout of the code

```
src/domain/          Pure. No React, no DOM. Fully tested.
src/state/           useReducer + context + localStorage. Tested.
src/components/ui/   Design-system primitives. Mirror the Figma component sets.
src/features/        Composed views. Where the product decisions live.
```

Dependencies point one way: `features` -> `components/ui` -> `domain`. `domain` imports
nothing from the app.

The state layer is split three ways deliberately — `billContext.ts` holds the context
object, `BillProvider.tsx` the component, `useBill.ts` the hook. One kind of export per
module is what keeps React Fast Refresh working, and `react-refresh/only-export-components`
will fail the build if you merge them back together.

## Conventions

- CSS Modules, one `.module.css` beside each component. Class names are camelCase.
- Money in the UI carries `font-variant-numeric: tabular-nums` (the `.tabular` class or
  the property directly) so columns align on the decimal point.
- Component props are explicit interfaces, not `React.FC`.
- Comments explain _why_, not _what_. Most of the code doesn't need one; the ones that
  exist are load-bearing product or maths reasoning.

## Testing posture

Tests live next to what they test. The money math and the reducer are thoroughly
covered; there are deliberately no component render tests. If you add a new rule about
how money is divided, add a test for it — that's the part where being wrong is
expensive and invisible.

## Design source

Figma: <https://www.figma.com/design/qWtj3HHYkn9oMfCP1AfjHc>

The file holds the token collections and seven component sets (Button, Field, Avatar,
Person Chip, Badge, Item Row, Summary Row) with variants and component properties. The
screen frames were never built — the Figma Starter plan caps MCP tool calls at 20 per
month and that budget was spent on the system. The screen specs live in the design
spec doc in the Claude project attached to this work, and the built UI follows them.

If the Figma quota is available again and you're asked to sync design and code:
components in `src/components/ui/` map 1:1 onto the Figma component sets by name, and
the CSS custom property names match the Figma variable code-syntax fields, so Code
Connect can be wired without renaming anything.

## Known gaps

- No receipt OCR (explicitly a nice-to-have in the brief, and not started).
- Dark mode exists in code but **not in Figma**. The Starter plan allows one mode per
  variable collection, so the dark palette in `tokens.css` (`:root[data-theme='dark']`)
  has no Figma counterpart. If the plan is ever upgraded, add a second mode to the
  colour collection and port those values rather than reinventing them.
- The bill is per-browser. No sharing beyond copying the text summary.
- `AvatarStack` caps at 3 faces + a count; there's no hover card listing the rest.
