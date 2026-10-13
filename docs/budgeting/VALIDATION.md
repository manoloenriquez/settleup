# Adaptive budgeting — validation

Date: 12 October 2026 · branch `feature/adaptive-budgeting` · design:
`docs/budgeting/IMPLEMENTATION_PLAN.md`.

Everything below was run on this machine. No user testing was done; nothing
here claims how real people find the feature.

## What was built

| Area | Where |
|---|---|
| Budget engine (pure, deterministic, integer money) | `packages/shared/src/budget/` — dates, money/rates, schema, plan versions, attribution, engine, merge, insights, copy |
| Persistence and sync | `supabase/migrations/20261012100000_personal_budgets.sql`; `apps/mobile/src/lib/budget/storage.ts`, `src/context/BudgetContext.tsx`, `src/services/budget.ts` |
| Spending sources | personal ledger on the device + the user's own group shares (`fetchGroupShares`, RLS) in `src/hooks/useBudget.ts` |
| Screens | Spending tab card, Home card, `spending/budget.tsx` (dashboard), `budget-setup.tsx` (setup/edit with preview), `budget-history.tsx`, `budget-plan.tsx` |
| Expense feedback | personal and group save toasts add "₱X left this week" |
| Guest → account | `GuestImportPrompt` also offers the guest budget |
| Assistant | `packages/shared/src/assistant/budget.ts` (+ rules, resolver, revalidation), executor/snapshot in `apps/mobile/src/lib/assistant/` |

## Brief scenarios → evidence

| Scenario | Evidence | Result |
|---|---|---|
| A underspend 7,000/5,000 → 9,000 | `budget.test.ts` "A" | Pass |
| B overspend 7,000/9,000 → 5,000 | "B" | Pass |
| C 5,000/11,000/4,000/8,000 → 7,000/9,000/5,000/8,000, then 7,000 | "C" | Pass |
| D 16,000 in week 1: next allowance 0, deficit kept | "D" (carry −9,000, then −2,000 → week 3 ₱5,000) | Pass |
| E 60,000 ceiling, 54,000 spent → nothing above 6,000 | "E" (allowance, week, month, today, affordability all ≤ 6,000) | Pass |
| F committed spending reserved, counted once when paid | "F" (rent reserved → paid; free amount unchanged) | Pass |
| G ₱4,000 dinner split two → ₱2,000 | "G" unit test; simulator: Ana's ₱300 taxi (split 3) and ₱1,350 electricity (split 3) count ₱550, not the ₱300 she paid | Pass |
| H editing an old expense recomputes later weeks | "H" | Pass |
| I cross-month weeks and month-end policy | "I" + "month end" tests (Oct 31 vs Nov 1, overrun carry, fresh start, weekly deficit within the limit) | Pass |
| J AI changes validated and confirmed | `assistant-budget.test.ts` (proposals, revision check at Confirm); simulator: "Set my weekly budget to 8k" changed nothing until Confirm, then ₱6,450 → ₱7,450 left | Pass |

Also tested: zero budget, negative carry, refunds, exclusions (credit-card bill),
currencies (USD/JPY/KWD precision, ties to even, no rate → not counted, rate
history, no rate before its date), trips and purchases set aside, reallocation
between weeks, leap year, all seven week starts, settings history, three-way
merge (both sides kept, tombstones, two budgets set up apart), and 60 seeded
random histories checking: safe today ≤ week ≤ month; no allowance above the
monthly capacity; carry = opening + allocated − spent; full mode =
base + carry; input order irrelevant; a settings change never alters earlier
weeks.

## Automated results

| Check | Result |
|---|---|
| `pnpm typecheck`, `pnpm lint` (8 packages) | Pass |
| Shared unit tests | 489 passed (353 before; +107 engine, +29 Assistant budget) |
| Mobile unit tests | 108 passed (+2 purge, +2 sync-error classification) |
| Web / AI unit tests | 54 / 24 passed (unchanged) |
| Web production build | Pass |
| SQL suites (local stack, all migrations) | 17/17 pass, including the new `personal_budgets` (anon blocked, CAS insert/update/stale, malformed documents refused, no direct writes, cross-user isolation, closure and auth deletion) |

## Simulator journeys (iOS 27, "Talli Journeys", local Supabase)

| Journey | Result |
|---|---|
| `BudgetJourneyTests` (guest): setup with suggestion and preview → ₱1,000 today / ₱7,000 week / ₱60,000 month → ₱1,200 expense → toast "Saved ₱1,200.00 · ₱5,800.00 left this week" → set aside ₱10,000 → recovery 3 weeks → history → relaunch keeps everything | Pass |
| `BudgetSignedInJourneyTests` (Ana): only her shares count; Assistant status, affordability (no expense created), weekly change applied only after Confirm; server copy has both plan versions (`[700000, 800000]`, `["setup", "assistant"]`) | Pass |
| `BudgetAppearanceTests` dark mode | Pass; screenshots reviewed |
| `BudgetAppearanceTests` accessibility XXL text | First run found clipping (header buttons, card amounts, label/value rows, history table) → fixed (stacked layouts, capped header buttons) → re-run passes, screenshots reviewed |

Final run, on the build with every fix above: `BudgetJourneyTests`,
`BudgetSignedInJourneyTests` (server copy `[700000, 800000]`,
`["setup", "assistant"]`), `BudgetAppearanceTests` (XXL text), and the
existing `GuestJourneyTests`, `CurrencyJourneyTests`,
`AssistantGuestJourneyTests`, `AssistantSignedInJourneyTests`,
`GroupJourneyTests`, `EditSplitJourneyTests` — **all passed**.

Screenshots: `tools/ui-driver/out/budget-*.png` (not committed).

## Assistant evaluation

See `docs/ai/AI_BENCHMARK_RESULTS.md` § Budgets. Rules-only scores on the
existing sets are unchanged; budget dev 19/19; budget held-out 11/14 in the
app's mode with one wrong preview ("Is 3,000 too much to spend on shoes this
week?" → expense preview, still needs Confirm). Adding budget fields to the
on-device model's schema was measured, cost two holdout2 balance questions
and fixed nothing, and was reverted.

## Reviews

| Review | Findings | Triage |
|---|---|---|
| Codex plan review | 2 critical, 7 high, 8 medium | All accepted except leaving-a-group history (documented limitation) and a partly-wrong route note; see plan §11 |
| Codex code review 1 (engine) | rate before its date applied; weekend affordability used the whole week; duplicate order; preview planned total; zero rate | All accepted and fixed with tests |
| Codex code review 2 (data, UI, Assistant) | figures while inputs load; setup form opened before the budget loaded; undo of a next-month change applied this week; itemized share in the toast | All accepted and fixed (`loading` gate in screens/Assistant, setup waits for the store, undo keeps `effectiveFrom`, itemized toast skips the budget line) |

The Codex CLI rejects a focus prompt with `--uncommitted`, so both code
reviews were its general review rather than the financial focus asked for.

## Limitations

- **Live database:** migration `20261012100000_personal_budgets.sql` was applied
  live on 13 October 2026 (`settleup_personal_budgets`); `personal_budgets.sql`
  passed live inside a rolled-back transaction. Signed-in budgets now back up.
- **Web:** no budgeting UI (the web app has no personal expenses).
- **Leaving a group:** its shares stop counting (RLS hides them), which can
  change past figures.
- **Exchange rates** are entered by the user; no automatic rates.
- **Week start** changes take effect next month (weeks already drawn never move).
- **Pending offline group expenses** aren't counted until they sync (the
  budget screen says how many).
- **Assistant:** unusual budget phrasings may get a clarifying question or, in
  one measured case, an expense preview (still needs Confirm). Fixed costs,
  rates, daily weights and month-end policy are changed in settings, not chat.
- **Native build:** no native code changed; a TestFlight build needs only the
  usual build-number bump.
