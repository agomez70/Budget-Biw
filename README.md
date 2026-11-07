# Budget Planner

A local-first, mobile-friendly web app for budgeting around paychecks (biweekly by default) and paying off debt. English and Spanish. Installable as a PWA and works offline.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: core money logic, store, i18n
npm run build      # typecheck + production build with service worker
```

## Architecture

```
src/
  core/      Pure TypeScript. No React, no DOM. All money logic, fully tested.
  storage/   Storage interface + IndexedDB (idb-keyval) and in-memory implementations.
  state/     BudgetStore: persistence, automatic snapshots, undo, reset, import.
  i18n/      en/es dictionaries (Spanish is type-checked against English keys).
  ui/        React screens and components. Plain CSS with design tokens (light/dark).
```

**Rules the code follows**

- Money is integer cents everywhere (`Cents`). Interest and hourly pay round to cents with `mulRound`.
- Dates are local `YYYY-MM-DD` strings. Date math goes through `core/dates.ts` (UTC calendar fields), never `new Date('YYYY-MM-DD')`.
- User-entered text (bill names, notes) is never translated.
- `Storage` is the only persistence boundary, so a sync backend can be added later.

## Core calculations (`src/core`)

| Function | What it does |
|---|---|
| `paychecks(settings, from, to)` | Paycheck dates; weekly/biweekly step from the anchor, semi-monthly and monthly clamp to month end. |
| `billsForPeriod(rules, window)` | Places bills on a paycheck by mode: `by` (paycheck on/before due date), `ahead` (one paycheck earlier), `each`, `once`. |
| `trueRemaining(state, today)` | Bank balance − unpaid bills on paychecks dated ≤ today in the open period. |
| `safePerDay(remaining, days)` | `remaining / max(1, days)`, 0 when nothing remains. |
| `debtPayoff(debts, plan)` | Monthly avalanche simulation with promo-APR expiry, lump sums by month, and actual payments already made this month. |
| `hourlyTakeHome(rate, hours, tax)` | `rate × hours × (1 − tax%)`. |
| `warnings(state, today)` | Bills due before next paycheck exceeding balance, paycheck 2+ days late, slow-period shortfall. |

## Payday flow

`confirmPayday` (`core/payday.ts`) is the **only** way a period closes. It's pure and idempotent (confirming the same paycheck twice returns the same state). The store takes a snapshot first, then in one step:

1. Closes the old period with a summary (planned vs actual pay, bills paid, debit/card spending by category, deposits, unlogged spending, leftover and what was done with it, debt balances at close) and moves its log, deposits and bill checks into the period record.
2. Old-period bills you confirm as paid are checked (paying down linked debts); the rest carry into the new period.
3. Sets the bank balance and `asOf`, marks the paycheck received with its actual amount.
4. Applies the leftover choice (roll / debt / savings) and opens the new period.

Reconciliation: `expected = start balance + manual corrections − debit purchases − checked bills + deposits + this paycheck`. Within the tolerance it reports "Matches"; a shortfall can be recorded as one "Unlogged" entry or accepted.

Correcting the bank balance by hand never closes a period.

## Backups, undo, reset

- Snapshots are taken automatically before every payday confirm, clear, reset, import and restore, and once a day on first open. The last 30 are kept (Settings → Backups), each with a short diff.
- Restore snapshots the current state first, so a restore can itself be undone. The current language is kept.
- **Undo last payday** is offered for 24 hours after a confirm.
- **Clear current period** removes the active log and deposits (reversing their effect on balances). **Reset everything** goes back to sample data and the setup wizard. Both use a two-step confirm.

## Behaviour notes

- Debit purchases reduce the bank balance; card purchases add to the card's balance and show as "Card debt added this period", separate from safe-to-spend. After the period closes they move to History but stay in the card balance.
- Checking a bill pays it from the bank; if it's linked to a debt it also reduces that balance. Changing the amount of a checked bill (an actual card payment that differs from plan) adjusts both, and the payoff projection uses the actual amount.
- Bills funded by the monthly deposit are listed separately and don't count against paychecks.
