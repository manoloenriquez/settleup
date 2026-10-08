# Talli UX validation report

**Date:** 9 October 2026 · **Baseline:** tag `ux-baseline-2026-10-09` (TestFlight build 6) · **Branch:** `ux/friction-pass`
Audit: `docs/ux-audit.md` · Plan: `docs/ux-improvement-plan.md`

## Summary

The five core flows now take **36% fewer taps** (33 → 21) and **29% fewer
screens** (28 → 20), with no scrolling. Every money check stayed: payer and
share sums, the large-amount confirmation, the live-balance re-check before
recording a payment, AI Confirm. Eight trust defects were fixed (P0). The
worst one: removing a group member rewrote everyone's balances.

All numbers below were measured by automation on the iOS 27 simulator. **No
real users took part.** The "estimated time" column is a model, not an
observation. A protocol for testing with 5–8 first-time users is at the end.

## Before and after: the five core flows

How these were measured: `tools/ui-driver/run-flows.sh` runs each flow on a
fresh install with the same seed data, once on the baseline build and once on
this branch. The JS for both runs on the same native shell. `FlowMeter`
counts every tap, field, keystroke, scroll and screen a person needs. Setup
(install, sign-in, seeding) is not counted. Raw data is in
`docs/ux/flows-before.jsonl` and `docs/ux/flows-after.jsonl`; screenshots
of every step are in `docs/ux/before/` and `docs/ux/after/`.

The estimated time uses a touch Keystroke-Level Model: 1.1 s per tap, 0.3 s
per typed character, 1.2 s to read each new screen, 1.0 s per scroll.

| Flow | Before: taps / scrolls / screens | After | Est. time before → after | Target |
|---|---|---|---|---|
| **F1** First launch → first expense, no account | 6 / 0 / 6 | **4 / 0 / 4** | 16 s → 12 s | < 45 s ✅ |
| **F2** Repeat group expense, equal split | 7 / 1 / 6 | **4 / 0 / 4** | 19 s → 12 s | < 15 s ✅ (estimate) |
| F2-first: first expense in a group (new measure) | — | 5 / 0 / 5 | — 14 s | — |
| **F3** Create a group and add 2 people without accounts | 9 / 0 / 6 | **5 / 0 / 4** | 23 s → 17 s | < 30 s ✅ |
| **F4** See what I owe and record paying it back | 5 / 1 / 6 | **3 / 0 / 4** | 14 s → 8 s | balance at a glance ✅ |
| **F5** Correct a wrong group-expense amount | 6 / 0 / 4 | **5 / 0 / 4** | 13 s → 11 s | direct edit ✅ |
| **Total (F1–F5)** | **33 / 2 / 28** | **21 / 0 / 20** | | |

### What changed, flow by flow (screenshot references)

**F1 — First launch** (`before-F1-01…03` → `after-F1-01`)
- Before, three onboarding screens came first: welcome, currency, then an
  "An account is optional" screen. On that screen *Create Account* was the
  filled primary button, and using the app without an account was a text link.
- Now there is one screen. It shows the value, a pre-selected main currency
  you can change in place, **Get Started** (no account), and "I Already
  Have an Account".

**F2 — Group expense** (`before-F2-04-filled`, `before-F2-05-confirm` → `after-F2-03-filled`, `after-F2-04-saved`)
- **Removed:** the "Smart add" banner and the five-way mode switch
  (Quick / Chat / Receipt / Detailed / Itemized) that sat above the amount
  field, and the "Confirm Expense" screen, which repeated the form.
- **Kept the money checks:** sums are still enforced, and an unusually large
  amount still asks first.
- **New:**
  - The amount field is focused when the form opens, and Save is in the
    header (the same pattern as the personal expense form).
  - The payer chip says **You** and comes first.
  - Saving shows "Expense added · **Undo**".
  - **Scan Receipt** and **Describe It** are small helper buttons.
  - Unequal and itemized splits sit behind "Split Unequally · More Options"
    and "Split by Item".
  - The add menu remembers the last group and offers "Split with Weekend
    Trip" directly.

**F3 — Create a group** (`before-F3-04…06` → `after-F3-03-filled`, `after-F3-04`)
- New Group has an optional **Who's in?** field ("Carla, Dina"), and people
  are added together with the group. Before, you landed in the group, then
  went through Add people → Settings → a name field → Add for each person →
  Back.
- **Create** is also in the header. The measured run showed the bottom
  button sits under the keyboard; the automation's first attempt tapped the
  "y" key.
- If adding the people fails, the group still exists and the organizer is
  taken straight to the add-people field with a message.

**F4 — Balance and settle up** (`before-F4-01`, `before-F4-04-balances` → `after-F4-01`, `after-F4-02-group`)
- **Home:**
  - Signed-in users who share expenses see their shared balance first.
  - Each group card shows what *you* owe or are owed, and opens the group.
- **Group screen:** the hero shows **your** position ("You owe ₱450.00"),
  the people it's with, and a **Settle Up** button. Before, the hero showed
  the group's total outstanding, and settling meant going to a Balances tab
  that listed the same debts three times. That tab now has one list, and the
  reminder bell appears only for other people's debts, with 44 pt targets.
- **Shared tab:** cards show your position per group instead of "₱900 open".

**F5 — Fix a mistake** (`before-F5-02-group`, `before-F5-03` → `after-F5-02-group`, `after-F5-03-edited`)
- **Expense rows:**
  - The whole row opens the expense. Before, there were three 16 pt icons
    side by side, with delete next to edit.
  - Each row says "Carla paid · your share ₱450.00" or "You paid · you lent
    ₱200.00", so a wrong payer or split is visible without opening it.
- **Edit sheet:**
  - The amount is selected when you tap it, so typing replaces it.
  - Delete moved into the sheet and still asks first, because the expense is
    in a shared ledger.
  - The sheet no longer slides under the status bar when the keyboard opens.

## P0 fixes and how each was verified

| # | Defect | Verification |
|---|---|---|
| U1 | Removing a member who had expenses or payments cascaded and deleted their shares: a ₱300 expense was left with ₱150 of shares | Probe on the local stack reproduced it. Migration `20261009120000_guard_member_history.sql` adds a trigger that refuses the delete. Removing a member with no history, deleting a whole group, and account closure still work. New SQL suite `member_history.sql`. **All 15 SQL suites pass** on the local stack. The apps show the database's explanation. |
| U2 | A receipt line amount could not be retyped (it reformatted on every keystroke) | `receipt-amount.test.ts`: typing "2", "24", "24.", "24.5" keeps each value; an empty field means 0; a third decimal is rejected without clearing the field. |
| U3 | A failed load of payment details, followed by Save, erased the saved details (mobile **and** web) | Code path: on mobile the form is never rendered while there's a load error; Try Again reloads. On web the page shows a message instead of the form. |
| U4 | `/p` told someone who was owed money "All Settled!" | Web component test; browser at 375 pt: `docs/ux/after/web-p-creditor.jpg` ("₱900.00 to you"). |
| U5 | `/p` copied masked numbers ("****4567") | Web component test: no Copy button for a masked number. Browser: `web-p-debtor-masked-organizer.jpg` ("account ending in 4567"). |
| U6 | Payment details typed in by an organizer were not labelled on web | Web component test, and the same screenshot ("Added by the group organizer — not confirmed by Carla"). |
| U7 | The group menu shared a link that had been turned off | The menu and the preview now read the live link state. When it's off they explain why and offer Group Settings. Shares now include the group name. |
| U8 | A friend row said "Settled up" when its balance failed to load | Code path: it now says "Balance couldn't load". |
| U23 | Dead `/g` and `/p` links showed the app's 404 with "Back to dashboard" | Browser: `web-g-dead-link.jpg`. |

## Other improvements

- **Accessibility and contrast** (ratios computed with the WCAG formula):
  - Filled buttons now use #047857 behind white text (5.5:1, was 3.77:1).
  - The `success` text token is now #047857 (5.5:1, was 2.54:1).
  - Badges use the dark text tokens (warning 1.93:1 → 7:1+).
  - The EmptyState action is at least 44 pt, and its description moved to gray500.
  - The receipt item name field and the edit-sheet fields have VoiceOver labels.
- **Friend tabs** (two-person ledgers) no longer offer an invite code, Add
  Member, budget, archive or leave. If the friend is removed, the controls
  come back.
- **Guest → account:** Home shows "N expenses from before you signed in are
  only on this iPhone · Add". It uses the same import as the Account tab, so
  guest data never disappears out of sight.
- **Terminology:** "Unlinked" → "Not on Talli yet" (mobile and web). The
  group card's unlabeled yellow count became "· 2 still owe".
- **Assistant:** "I paid Sarah back 500" no longer reads the name as "Sarah
  back". In the rules-only eval, the development set is unchanged (99/99) and
  the clean holdout went from 24 to 25 of 39 task successes, with wrong
  previews unchanged (2/39). These rules were not tuned against the holdout.
  The hybrid eval on the macOS 27 model was not re-run.

## Test results

| Check | Result |
|---|---|
| `pnpm typecheck` | 8/8 packages pass |
| `pnpm lint` | passes (mobile at `--max-warnings 0`) |
| Unit tests | shared 340, mobile 98, web 51, ai 24, all passing. Baseline was 335 / 89 / 45 / 24; the new tests cover people parsing, expense stake, receipt amounts, public pages and the Assistant name. |
| `pnpm --filter @template/web build` | passes |
| SQL suites (local stack, every migration applied) | 15/15 pass, including the new `member_history` |
| Measured flows (`run-flows.sh`, before and after) | 5/5 pass in each build |
| Regression journeys on the simulator | 12/12 pass (table below) |
| Codex plan review / code review | 1 round each, triaged (see the commit messages) |

Regression journeys (XCUITest, iOS 27 simulator, local Supabase, fresh install each):

| Journey | Covers | Result |
|---|---|---|
| GuestJourneyTests | one-screen onboarding, add, edit (amount selected on focus), delete + Undo, relaunch | pass |
| CurrencyJourneyTests | PHP/USD/JPY personal expenses never mixed | pass |
| AccountJourneyTests | guest expenses → new account, imported once | pass |
| GroupJourneyTests (`run-group.sh`) | create group (header Create), add 2 people, ₱900 split via header Save, record ₱300, link off/on/new; server rows checked | pass |
| EditSplitJourneyTests (`run-edit.sh`) | open the expense by its row, change date + 50/30/20 split; stored shares checked | pass |
| FriendJourneyTests (`run-friend.sh`) | friend invite, ₱2,000 split, settle to zero | pass |
| PaymentDetailsTests (`run-payment.sh`) | save GCash details, shared-link opt-in; stored row checked | pass |
| AssistantGuest/SignedIn (`run-assistant.sh`) | Assistant proposals, Confirm, Undo; server rows checked | pass |
| AppearanceTourTests, light and dark | every main screen in both appearances | pass (screens reviewed) |
| LargeTextTests (AX XXXL) | Home and payment details at the largest text size | pass |

One interruption is worth recording: during a first attempt every action
waited 60 s for the app to go idle. A control run of the *baseline* build on
the same simulator then failed to bootstrap at all; after rebooting the
simulator, both builds ran without stalls. It was simulator state, not app
behaviour.

## What was not verified

- **Real people.** Nothing here measures comprehension, hesitation or
  satisfaction. The model times assume a practised user.
- **Physical iPhone.** Apple Intelligence receipt scanning and the Assistant
  on device, haptics, and the share sheet on a real phone were not tested.
- **Live database.** The migration `20261009120000_guard_member_history.sql`
  is applied locally only. **It must be applied to the live project by the
  owner.** Until then, the apps show a generic error only if the delete
  fails, and the live database still allows the corrupting delete.
- **Largest text on the new group hero and rows:** the large-text tour covers
  Home and payment details only; the group screen was checked in Dark Mode
  at the default size, not at accessibility sizes.
- **Offline:** the new Undo uses the existing outbox path
  (`deleteExpenseOrQueue`). The online path was exercised by automation; the
  offline path is covered by the existing outbox unit tests, not by a new
  simulator run.

## Remaining issues (prioritised)

| Priority | Issue | Why it remains |
|---|---|---|
| Owner action | Apply migration `20261009120000` to the live project. Redeploy web. | Needs the owner's Supabase and Vercel access. |
| P1 | Joining by invite code creates a second copy of someone already listed under the same name (U27) | Needs a product decision on a "Which of these is you?" claim step. |
| P1 | Group Settings is still one long screen with four kinds of link | Splitting it into People / Sharing / Group is a larger rewrite. The friend-tab cleanup and the terminology change remove the worst confusion. |
| P2 | Receipt items are assigned to everyone by default, and assigning is item × person toggles | Needs device testing with real receipts. |
| P2 | Assistant: no Edit on a preview; no personal edit or delete; "Settle up with Mia" isn't understood | Changes the AI write contract (an amount not in the user's words), so it's the owner's call, and it needs the macOS 27 eval. |
| P2 | `gray400` hint text is 2.54:1 | A token change touching ~150 call sites; should be done with a visual pass. |
| P2 | The Undo toast stays 5 s even under VoiceOver; `/g` and `/p` have no loading skeleton; register asks for the password twice | Small; for the next polish pass. |

## Recommended usability test (5–8 first-time users)

**Recruit:** people who split costs with friends at least monthly, half of
whom have never used a bill-splitting app. Use iPhones with Talli freshly
installed (TestFlight). Use a think-aloud protocol with no help from the
moderator. Record the screen and audio.

**Tasks** (read aloud one at a time; start timing at the first touch):
1. "You just had lunch for ₱250. Record it." (F1, no account)
2. "Create an account." Then: "Make a group for a beach trip with Carla
   and Dina, who don't have the app." (F3)
3. "You paid ₱1,200 for dinner for the three of you. Add it." Then, a
   minute later: "Add the ₱600 snacks you also paid for." (F2 first and
   repeat)
4. Hand them a phone seeded so they owe Carla ₱450. "How much do you owe,
   and to whom?" Stop the timer when they say it. Then: "You just sent
   Carla the money by GCash. Record it." (F4)
5. "The taxi was actually ₱350, not ₱300. Fix it." (F5)
6. "Send Carla a link so she can see what she's owed." (sharing)

**Measure per task:**
- completion without help (yes / with a hint / failed)
- time
- wrong taps
- moments of hesitation over 3 s, and where they happen
- the participant's own words for what a screen means, e.g. "what does
  'Settle Up' do?"

After the session, ask the SEQ (single ease question, 1–7) for each task,
and ask them to explain the Home balance.

**Pass bar:**
- task 1 under 45 s
- task 3 repeat under 15 s
- task 4 answered within 5 s of the screen appearing
- 0 participants believe Talli moved money
- at least 80% complete each task without a hint

**Report** the observed numbers next to this document's model estimates.
Don't replace them.
