# Adaptive budgeting — implementation plan

Status: design approved for implementation on 12 October 2026 (owner brief:
"AI-powered adaptive budgeting system"). This file is the engineering design.
Results and test evidence go in `docs/budgeting/VALIDATION.md`.

## 1. What exists today (inspected, not assumed)

| Area | What is there | Reuse |
|---|---|---|
| Platforms | Expo 54 iOS app (personal + shared), Next.js web (groups only — no personal expenses UI) | Budgeting ships on **mobile**. Web is out of scope: it has no personal ledger to budget. |
| Personal expenses | `packages/shared` schemas/utils `personal*`; device store per owner (`talli:personal:v1:guest` / per account); `PersonalLedgerContext` serializes writes, syncs signed-in stores to `settleup.personal_expenses` (last write to arrive wins) | Source of personal spending. Same store/sync pattern for the budget document. |
| Group expenses | `settleup.expenses` + `expense_payers` + `expense_participants` (share per member, itemized expenses too); members linked to accounts by `group_members.user_id`; RLS lets members read their groups' rows | The user's **share** (`share_cents` of their member rows) is their economic cost. Read directly through PostgREST under RLS — no new RPC needed. |
| Settlements | `payments` (debt transfers) | Never spending (see §4). |
| Currencies | 52 ISO codes with minor-unit precision; amounts in different currencies are never summed or converted anywhere in the app | Budget has one currency; other currencies count only with a user-set rate (§4.4). |
| Group budget | `groups.budget_cents`: a progress bar on a group's total | Unrelated (a group cap, not a person's budget). Left as is. |
| Recurring | Group recurring expenses materialised server-side | Not personal; fixed costs are modelled in the budget (§3.3). |
| Assistant | Rules interpreter first, then on-device FoundationModels (`AssistantCommand` @Generable); deterministic resolver in `packages/shared/src/assistant`; every write is a preview + Confirm; executor reuses the screens' write paths | Extended with one `budget` action and a few slots. No new chat. |
| Guest mode | Personal expenses, assistant (personal), no account required | Budgeting works fully for guests. |
| Offline | React Query persisted cache, outbox for group writes, device-first personal ledger | Budget is computed on the device from local data; never needs a connection. |
| Tests | Vitest (shared 353, mobile 104, web 54), SQL suites on local Supabase, XCUITest journeys on the iOS 27 simulator, assistant eval on the Mac's model | All extended. |

Gaps found: no notion of a period budget, no "my share" query, no refunds
(personal amounts must be > 0), the rules interpreter turns any sentence with
a number into an expense ("Can I afford to spend 4k?" → add ₱4,000) — fixed
here by matching budget vocabulary first.

## 2. Principles

1. **Deterministic engine, pure functions.** `packages/shared/src/budget/`
   has no React, storage, network or model. Every displayed number is
   recomputed from (stored configuration + authoritative transactions + today).
   No running counters are stored, so edits, deletes and late syncs can never
   leave a stale total.
2. **Integer minor units only.** Currency conversion uses integer rates
   (decimal string → scaled BigInt), never floats.
3. **Every amount has a source.** The engine returns the components behind
   each allowance (base, surplus, repayment, reallocation, monthly cap) so the
   UI and the Assistant explain from the same data.
4. **The monthly ceiling governs.** No recommendation, allowance or answer
   exceeds what remains of the month after reservations.
5. **Configuration changes never rewrite history.** Plans are versioned with an
   effective date; a past week keeps the settings it ran under. Transaction
   edits *do* recompute (that is the truth changing).
6. **The model only interprets words.** Budget questions are answered and
   changes proposed by deterministic code; every change needs Confirm.

## 3. Domain model

### 3.1 Budget document (one per owner)

```
BudgetDocument {
  version: 1, id, createdAt, updatedAt
  startDate          ISO date: the weekly ledger starts at the week segment containing it
  plans[]            append-only BudgetPlanVersion
  annotations[]      id-keyed records: refunds, exclusions, fixed-cost links, planned spending, reallocations
  deletedAt          budget turned off (tombstone, so it syncs)
  sync               local | pending | synced, serverUpdatedAt
}
BudgetPlanVersion { id, effectiveFrom (segment start date), createdAt, source: setup|manual|assistant|import, summary, config }
BudgetConfig {
  currency
  monthlyLimitMinor     ≥ 0  — total monthly ceiling
  weeklyTargetMinor     ≥ 0  — flexible weekly allowance
  dayWeights            7 non-negative integers (Sun..Sat) or null = even
  weekStartsOn          0..6, default 1 (Monday)
  recovery              { mode: "full" } | { mode: "smoothed", weeks: 2..8 }   default full
  monthEnd              "carry_overspend" | "fresh_start"                       default carry_overspend
  outsideWeekly[]       category slugs that count to the month only (e.g. lodging for trips)
  categoryLimits[]      { category, limitMinor }
  fixedCosts[]          { id, name, amountMinor, category, dueDay 1..31 | null }  (monthly)
  rates[]               { currency, rate (decimal string: budget units per 1 unit), effectiveFrom }
}
```

Which version applies:
- per **day/segment** (weekly target, weights, recovery, bucket rules): the
  latest version with `effectiveFrom ≤ segment start` (ties: latest `createdAt`);
- per **month** (ceiling, fixed costs, category limits, month-end policy): the
  version in effect on `min(month end, today)`.

Changes made in the app take effect from the **start of the current week
segment** (so "set my weekly budget to 8k" changes this week, as people
expect), and monthly values from the current month. Past segments and months
keep their versions.

### 3.2 Periods

- Months are calendar months in the device's local calendar. All budget dates
  are local ISO dates, like expense dates; "today" is the device's local date.
- A **segment** is the part of a week (starting on `weekStartsOn`) inside one
  month. A week that crosses a month boundary is two segments, each in its own
  month. Four- and five-week months, 28–31 days and leap days fall out of this.
- A segment's **base** is the sum of its days' allocations. Daily allocation
  splits the weekly target over the seven weekdays by `dayWeights` (even when
  null) with the largest-remainder method, so seven days always sum to exactly
  the weekly target; a 3-day segment gets those three days' amounts.

### 3.3 Reservations (money already spoken for)

- **Fixed costs** (monthly: rent, internet): reserved =
  `max(0, amount − actual spending matched to it this month)`. Matching: an
  explicit link annotation, or an eligible expense in that month whose
  description contains the fixed cost's name (word match, case-insensitive).
  Matched spending counts to the month, not the weekly allowance.
- **Planned spending** (one-off, dated: a phone, a trip): annotation
  `{name, amountMinor, from, to, coversAllSpending}`. A trip
  (`coversAllSpending`) takes every eligible expense dated `from..to`; a
  purchase takes linked/name-matched expenses in its month. Reserved =
  `max(0, amount − matched)` while its month is current.
- **Category allocations outside the weekly budget**: for a category in
  `outsideWeekly` with a limit, the unspent part of the limit is reserved.

When a reservation becomes an actual expense, the expense is added to spent
and the reservation shrinks by the same amount: never counted twice.

### 3.4 Spending attribution (§8 of the brief)

| Record | Counts as | Amount |
|---|---|---|
| Personal expense | spending on its date | full amount |
| Group / friend expense where I'm a participant | spending on the expense date | **my share** (`expense_participants.share_cents` for my member) |
| Group expense I paid but don't share | nothing | 0 (I lent the money) |
| Settlement / reimbursement (`payments`) | nothing | it moves a debt that was already counted as shares |
| Refund annotation | negative spending on its date | `−amount` |
| Excluded record (annotation: "don't count", e.g. a credit-card bill payment for purchases already logged, a transfer) | nothing | 0, listed as excluded |
| Different currency without a rate | nothing | listed as "not counted: no rate" |

Each attributed item gets a **bucket**: `weekly`, `fixed:<id>`,
`planned:<id>`, `outside` (category outside weekly). The month counts every
bucket; the weekly ledger counts only `weekly`. Items are keyed by
`personal:<id>` / `group:<expense id>`, so a record can never be counted twice;
an edited record replaces itself. Possible duplicates (a personal expense and
a group share on the same day with the same amount) are flagged, not guessed.

### 3.4.1 Currency conversion

Budget currency defaults to the main currency. An expense in another currency
counts only if the budget has a rate for it effective on the expense date
(`rates`, set by the user; changing a rate adds a new entry effective today, so
history is unchanged). Conversion: `round_half_even(amountMinor × rate ×
10^(budgetPrecision − sourcePrecision))` in BigInt; the item records the
original amount and the rate used. No automatic rates (no network, no
external service).

## 4. The adaptive weekly engine

For each month M from the start month to the current one, and each segment k
in it (from the segment containing `startDate`):

```
opening(M)       = −overrun(M−1)  when M−1's policy is carry_overspend, else 0  (never positive)
effectiveCeiling = monthlyLimit + opening(M)
carry(0)         = opening(M)

deficit          = max(0, −carry(k−1));  surplus = max(0, carry(k−1))
repayment(k)     = full:     deficit
                   smoothed: ceil(deficit / r(k)), r(k) = min(window, segments left in M incl. k)
theoretical(k)   = base(k) + reallocation(k) + surplus − repayment(k)          (may be < 0)
allowance(k)     = clamp(theoretical(k), 0, monthly capacity at segment start)
spent(k)         = Σ weekly-bucket amounts dated in segment k
carry(k)         = carry(k−1) + base(k) + reallocation(k) − spent(k)
```

- **Carry is the auditable signed ledger** (the brief's
  `newCarryover = previousCarryover + base − spent`). It uses the base, not
  the displayed allowance, so hitting zero or the monthly cap never erases a
  deficit and never manufactures surplus.
- **Smoothed recovery** changes only *when* a deficit is repaid. The window
  resets to N weeks when a week ends over its displayed allowance and counts
  down otherwise; underspending repays first; installments never exceed the
  deficit; the last segment of the month takes whatever is left. If the
  recovery doesn't fit before month end, the plan says so (shortfall) and the
  month-end policy applies to what remains.
- **Month end**: positive carry is reported as "saved against the plan" and
  never moves to the next month. A deficit within the monthly ceiling ends
  with the month (stated in history). Spending **over the ceiling** carries
  into the next month as a negative opening (reduces both its weekly
  allowances and its effective ceiling) unless the user chose `fresh_start`;
  either way history shows it.
- **Reallocation** ("vacation next week"): moves base between segments of the
  same month; the deltas sum to zero, so the month's total allocation and the
  ceiling are unchanged. Stored as an annotation with its explicit schedule.

Live figures for today (current segment k):

```
capacityNow     = effectiveCeiling − spentAll(month to date, all buckets) − reservedNow
availableWeek   = max(0, min(theoretical(k) − spent(k incl. today), capacityNow))
todayShare      = (theoretical(k) − spent before today) × w(today) / Σ w(today..segment end)   (floor; last day gets the rest)
safeToday       = max(0, min(todayShare − spentToday, capacityNow))
remainingMonth  = effectiveCeiling − spentAll;  available = max(0, remainingMonth − reservedNow)
projection      = spentAll + reservedNow + (weekly spending so far / days elapsed) × days left
```

Invariants (tested on random histories):
1. `safeToday ≤ availableWeek ≤ max(0, capacityNow)` and all are ≥ 0.
2. Σ over a month of (base + reallocation) − Σ weekly spent = closing carry − opening.
3. Full mode: theoretical(k) = base(k) + carry(k−1).
4. Smoothed and full modes reach the same carry after any spending history
   (timing differs, totals don't).
5. Reordering or re-keying input records does not change any output; a record
   counted twice is impossible (keyed).
6. Changing a plan effective from segment j never changes outputs before j.
7. No allowance exceeds the remaining monthly capacity.

Required scenarios (unit tests): A underspend 7,000/5,000 → 9,000; B overspend
7,000/9,000 → 5,000; C 5,000/11,000/4,000/8,000 → 7,000/9,000/5,000/8,000 then
7,000; D 16,000 in week 1 → next allowance 0, deficit 9,000 kept, recovered
later; E ceiling 60,000 with 54,000 spent → nothing above 6,000; F a 20,000
fixed cost reserved then paid, counted once; G ₱4,000 dinner split in two →
₱2,000; H editing an old expense recomputes later weeks; I cross-month weeks
and month-end policy; J assistant changes validated and confirmed. Plus zero
budgets, negative carry, refunds, multi-currency, time-zone-free date math,
leap years, every week-start day.

## 5. Persistence and sync

- **Device store** (`apps/mobile/src/lib/budget/storage.ts`): guest key
  `talli:budget:v1:guest`, account keys per project and user, like the
  personal ledger. `BudgetContext` loads, validates (a store that fails
  validation is kept, never overwritten), serializes writes and persists each
  change before showing it. Guests: everything local.
- **Server** (migration `20261012100000_personal_budgets.sql`):
  `settleup.personal_budgets(user_id pk → auth.users, doc jsonb, created_at,
  updated_at)`; RLS select own; no direct writes;
  `save_personal_budget(p_doc jsonb, p_base_updated_at timestamptz)`
  (definer, `search_path=''`, authenticated only, refuses closed accounts,
  size ≤ 256 KB, `version = 1` object): compare-and-swap on `updated_at`;
  mismatch returns `{status: 'conflict', doc, updated_at}`. Rows deleted on
  account closure.
- **Conflict merge** (pure, `mergeBudgetDocuments`): plan versions union by id
  (append-only, so nothing is lost); annotations by id, newer `updatedAt`
  wins, tombstones included; then re-save with the server's base.
- **Rollout fallback**: if the table/RPC is missing (migration not yet applied
  live), sync reports "Budget saved on this iPhone" and the app keeps working;
  nothing is lost.
- **Guest → account**: the existing "Add N expenses to your account?" prompt
  also offers the guest budget when the account has none (checked on the
  server). If the account already has one, the account's budget is kept and
  the guest's stays on the device. Same document id → retries never duplicate.
- **Group shares** for signed-in users: React Query
  `["budgetShares", from]` (persisted, works offline), PostgREST read of my
  `expense_participants` rows joined to `expenses` and categories, last 6
  months; invalidated with the existing expense mutation invalidations.
  Pending (queued offline) group expenses are not in it yet; the dashboard
  says "N group changes not included yet", like the balances tab.

## 6. UX

Native to Talli: same cards, typography, colours (light/dark tokens),
Dynamic Type and 44 pt targets; no new tab (the tab bar already has five).

- **Spending tab** header: budget summary card (Safe today · This week · This
  month) or a "Set a Budget" card when none exists. Home shows the same compact
  card when a budget exists (after shared balances when those come first, so
  the UX-pass flows keep "balance visible at launch").
- **Budget screen** (`/budget`): three metrics; this week (allowance bar, why it
  changed — each component with its source); this month (progress, reserved,
  available, projection, on-track); upcoming fixed and planned spending;
  categories with limits; warnings (over week, over month, plan doesn't fit
  the ceiling, items not counted). Links: History, Edit Budget.
- **Setup** (`/budget/setup`): one screen. Monthly limit; weekly allowance
  pre-filled with a suggestion (from history when there are ≥ 3 weeks of it,
  else ceiling minus fixed costs over the month's weeks) and its reason; daily
  spread (even / more on weekends / like my spending / a daily amount); week
  start; Save. "More options" holds recovery mode, month-end policy, fixed
  costs, category limits and outside-weekly categories, exchange rates. A live
  **preview** shows the next weeks' allowances and whether the plan fits the
  ceiling before saving. "Set up with Assistant" opens the Assistant.
- **History** (`/budget/history`): months, each with its weeks: allowance,
  spent, carry in/out, policy applied at month end.
- **Spending item actions** (from the budget's lists): don't count / count
  again, count toward a fixed cost or plan, record a refund.
- **After saving an expense**: the existing toast gains one line: "₱3,800 left
  this week" (or "₱200 over this week"). No extra notifications.

## 7. Assistant

One new action `budget` with slots `budgetIntent` (status, afford, explain,
savings, forecast, breakdown, setup, change, recover, plan), `budgetField`
(monthly, weekly, daily, category), `changeKind` (set, increase, decrease),
`percent`; existing `amount`, `dateMention`, `description`/`searchText`
(category words) reused. Added to the TS schema; the rules interpreter
matches budget vocabulary **before** its expense catch-all. (Also adding them
to the Swift @Generable was measured and reverted: it cost two holdout
questions and fixed no budget case — `docs/ai/AI_BENCHMARK_RESULTS.md`.)

| Brief's tool | Intent | Kind |
|---|---|---|
| get_budget_summary | status ("How much can I safely spend today?") | answer |
| analyze_spending / get_budget_breakdown | breakdown, savings | answer |
| get_spending_forecast | forecast | answer |
| explain_budget_change | explain | answer |
| (affordability) | afford ("Can I afford 4k this weekend?") | answer: compares against today / weekend days / week / month capacity |
| propose_budget → create_budget | setup ("I want 60k monthly…") | proposal + Confirm; asks only for the monthly amount if missing |
| preview_budget_adjustment → update_budget | change ("Increase my dining budget by 1k", "reduce spending by 15% next month") | proposal showing before → after and next weeks' allowances; Confirm |
| recommend_recovery_plan | recover | answer with options, proposal to switch to smoothed recovery; Confirm |
| (planning) | plan ("vacation next week") | asks the amount, proposal: planned spending or a reallocation; Confirm |

All numbers come from `packages/shared/src/budget`; the resolver re-checks a
proposal against fresh state at Confirm (`revalidateProposal`). The model's
context gains nothing (no amounts, no transactions). Without Apple
Intelligence the rules interpreter covers the phrasings above; the budget UI
never depends on the Assistant.

## 8. Security

- RLS: `personal_budgets` select own; writes only through the definer RPC that
  checks `auth.uid()`, account closure, shape and size. No service role.
- Group shares read under the user's JWT and existing RLS.
- Budget data never leaves the device except the user's own synced document;
  the model sees no amounts.
- Validation: Zod for every stored or received document and every assistant
  slot; amounts bounded (≤ 99,999,999,999 minor units), dates ISO, rates
  positive decimals with ≤ 8 decimals.

## 9. Phases

1. Plan + Codex plan review (this file).
2. Engine (`packages/shared/src/budget`): money/rates, periods, allocation,
   attribution, reservations, ledger, live figures, recommendations, explain,
   merge; scenario, edge and invariant tests. Commit.
3. Data: migration + SQL tests, types, device store, `BudgetContext`, group
   shares query, guest import, purge, sync fallback. Commit.
4. UI: summary card, budget screen, setup with preview, history, item actions,
   toast line. Commit.
5. Assistant: command slots (TS + Swift), rules, resolver, executor, revalidate,
   tests, eval cases; run the eval (dev + holdout2) and compare. Commit.
6. Verification: typecheck, lint, all unit suites, SQL suites, web build,
   simulator journeys (guest budget, signed-in with group share, assistant,
   dark mode, large text), regression journeys; Codex code review; fixes;
   `docs/budgeting/VALIDATION.md`. Commit.

Not in scope: web budgeting UI (no personal ledger on web), automatic exchange
rates, bank/credit-card account modelling (handled by "don't count"), push
notifications for budgets.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Model misreads budget questions as expenses | Rules match budget words first; every write still needs Confirm; eval cases added |
| Adding an action degrades the model on existing cases | Eval before/after on dev and holdout2; revert the Swift part if it regresses |
| Live DB lacks the new table | Device-only fallback; owner applies the migration (or approves me applying it) |
| Group shares missing offline / pending | Persisted query; explicit "not included yet" note |
| Plan versioning confusion | Changes always effective from the current segment; preview shows the effect |
| Performance (recompute on every render) | Pure function memoised on inputs; months × segments × items is small (≤ 6 months, ≤ a few thousand items) |

## 11. Codex plan review (12 October 2026) — triage and resulting changes

| # | Finding | Decision |
|---|---|---|
| C1 | Sync metadata inside the shared document; merge by device clocks | **Accept.** The synced document carries no sync state. The device store is an envelope `{doc, base, sync, serverUpdatedAt}`; `base` is the last document the server acknowledged. Conflicts are a **three-way merge** on top of the server copy: whatever changed locally since `base` (per plan id, per annotation id, per top-level field) wins because it arrived later; everything else takes the server's. No clocks compared. |
| C2 | Closure won't delete budget rows (`close_account` keeps `auth.users`) | **Accept.** A trigger on `settleup.closed_accounts` deletes the row, like personal expenses. |
| H1 | Six-month share window vs. history from `startDate` | **Accept.** Shares are fetched from the start month (and 8 weeks before it for suggestions), paginated to the end; the result carries `complete`. When incomplete, figures say so. |
| H2 | Leaving a group removes access to its old shares | **Accept as a documented limitation.** Snapshotting closed months would contradict "editing an old expense recomputes" (scenario H). The budget history notes it; the Help text says shares in groups you left stop counting. |
| H3 | Assistant isn't wired to budget data | **Accept.** `AssistantSnapshot.budget` (document + computed state + revision), `ExecutorDeps.budget` (append a plan version / add or remove an annotation), revalidation compares the document revision and recomputes the figure the preview showed; undo restores the previous plan by appending it again (history stays append-only). |
| H4 | Slots can't express every setting | **Accept.** The Assistant handles setup, monthly/weekly/daily/category amounts (set, ±amount, ±percent), recovery mode with a number of weeks (`count` slot), and planned spending (amount + dates + name). Fixed costs, rates, day weights and month-end policy hand off to the Budget settings screen (navigate plan), never guessed. |
| H5 | "Device-only" fallback could hide real failures | **Accept.** Only "function/table does not exist" (PostgREST `PGRST202`/`PGRST205`, Postgres `42883`/`42P01`) means "sync not available yet". Everything else is a sync error with retry, as personal sync does. |
| H6 | RPC accepts arbitrary jsonb | **Accept.** The RPC checks the structure it relies on (object, `version = 1`, `id` uuid matching the row's document id, `startDate` date, `plans` non-empty array of objects with `id`/`effectiveFrom`/`config`, `annotations` array, size ≤ 256 KB). Clients still validate with Zod and keep (never overwrite) a store they can't read. |
| H7 | One expense could match several buckets | **Accept.** Exactly one bucket, by precedence: excluded → explicit link → planned trip (date range) → fixed cost by name → planned purchase by name → outside-weekly category → weekly. Ties inside a rule go to the item with the smaller id. |
| H8 | Group categories are per-group rows | **Accept.** Budget categories are the nine shared slugs. A group category maps to its slug when it is one of the nine (the global defaults use them), else `inferCategorySlug(name)`, else `other`. |
| M1 | Tombstone/conflict behaviour | **Accept** (covered by C1's three-way merge: a local deletion since base wins; a server deletion wins over an unchanged local copy). Repeated CAS conflicts: up to 3 merges per pass, then backoff. |
| M2 | Conversion with 0/2/3-decimal currencies | **Accept.** Rate parsed to an integer scaled by 10^8; result = round-half-even of `amount × rateScaled × 10^bp ÷ (10^8 × 10^sp)` with BigInt numerator/denominator (any exponent sign); a result beyond the safe range is "not counted" with a reason. One rate per (currency, effectiveFrom). |
| M3 | Configuration invariants | **Accept.** Zod refinements: weights sum > 0, unique category limits, unique fixed-cost ids, unique rates per date, no rate for the budget currency. Plan feasibility (weekly plan + fixed costs > ceiling) is a **warning** in the preview, not an error. |
| M4 | Outbox count includes non-expense writes | **Accept.** Count only `expense.*` entries. |
| M5 | Guest import underspecified | **Accept.** Signed in: pull the account's budget first. Offer the guest budget only if the server and account store have none. Import copies the guest document (same id) into the account store as pending and saves with no base (insert). If a server budget appeared meanwhile (conflict), the account's is kept and the guest copy stays on the device. The guest store is removed only after the server acknowledged that id. |
| M6 | Route placement | **Partly accept.** The routes live in the Spending tab stack (`(tabs)/spending/budget*.tsx`), so the tab bar stays and guests are allowed by the existing rule; added to `ROUTES`. |
| M7 | Purge must include budget keys | **Accept.** Budget prefix added to `inactiveAccountKeys`, removable when synced. |
| M8 | SQL tests for data-loss boundaries | **Accept.** Malformed documents, direct table writes, cross-user reads, closure deletion, CAS insert/update races, auth-user deletion. |
