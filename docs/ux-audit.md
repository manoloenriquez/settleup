# Talli UX audit — friction, clarity and trust

**Date:** 9 October 2026 · **Baseline:** tag `ux-baseline-2026-10-09` (commit `620c516`, TestFlight build 6) · **Work branch:** `ux/friction-pass`

This audit asks one question of every screen: *can someone who has never used
Talli do what they came for immediately, confidently and with little effort?*
It builds on the October product audit (`docs/audit/2026-10-product-audit.md`),
which fixed the structural gaps (guest mode, currencies, friends, sharing
privacy). This pass is about friction and trust in the flows that now exist.

## How the evidence was gathered

| Source | What it covers |
|---|---|
| **Measured flows** (`tools/ui-driver/run-flows.sh`, `FlowMeter.swift`) | The five core flows on the iOS 27 simulator (Release build, local Supabase stack, fresh install per flow). Every tap, field, keystroke, scroll and screen a person needs is counted; each screen is screenshotted. Results: `docs/ux/flows-before.jsonl`, screenshots `docs/ux/before/`. |
| **Code inspection** | Every mobile screen and shared component, the public web pages, the Assistant resolver, the receipt pipeline and the guest → account path. Evidence is cited as `file:line`. |
| **Database probes** | Rolled-back transactions on the local stack for claims about ledger integrity. |
| **Baseline checks** | `pnpm typecheck`, `pnpm lint`, `pnpm test` (shared 335, mobile 89, web 45, ai 24): all pass before any change. |

No usability testing with real people was done. Where this document says a
flow is "confusing" that is an expert judgement backed by the cited evidence,
not an observed user outcome. A protocol for 5–8 first-time users is in
`docs/ux-validation-report.md`.

## Executive summary

Talli's foundations are strong: money is integer minor units, splits are
deterministic, currencies are never mixed, offline writes replay exactly
once, guest data is never silently dropped, and AI never writes without a
human Confirm. The problems are in the *experience on top* of that core:

1. **The main sharing flows carry ceremony that adds no safety.** Adding a
   group expense is 7 taps across 6 screens, including a "Confirm Expense"
   screen that repeats the form you just filled in. The add form opens with a
   promotional banner and a five-way mode switch (Quick / Chat / Receipt /
   Detailed / Itemized) above the amount field, and Save is below the fold.
2. **Your own balance is not where you look.** For a signed-in user, Home
   leads with *personal* monthly spending; the shared balance sits at the
   bottom of the first screen, with the per-person and per-group breakdown
   below the fold on a 6.3" phone. In a group, the hero number is the
   *group's* total outstanding, not what *you* owe; settling up takes a
   switch to a Balances tab that shows the same debts three times.
3. **First launch spends three screens before anything useful**, and the
   final one makes *Create Account* the primary button while "Continue Without
   an Account" is a text link — contrary to "local use is fully supported".
4. **Four data-trust defects** (P0): removing a member with history corrupts
   balances; a receipt line amount cannot be corrected; a failed load followed
   by Save wipes payment details; the public balance page tells a creditor
   "All Settled!".
5. **Fixing a mistake works but is fiddly**: group expense rows are not
   tappable — three ~32pt icons (comment, edit, delete) sit side by side,
   delete next to edit, and rows don't say who paid or what your share was.

## Measured baseline (before)

Counts are what a person must do; setup (install, sign-in, seed data) is
excluded. "Est. time" applies a touch Keystroke-Level Model (tap 1.1 s,
typed character 0.3 s, new screen 1.2 s reading, scroll 1.0 s) — an estimate
for comparison, not a measurement of people.

| Flow | Taps | Fields | Keys | Scrolls | Screens | Est. time | Target |
|---|---|---|---|---|---|---|---|
| F1 First launch → first expense (no account) | 6 | 2 | 8 | 0 | 6 | 16 s | < 45 s |
| F2 Repeat group expense, equal split | 7 | 2 | 10 | 1 | 6 | 19 s | < 15 s |
| F3 Create group + add 2 people without accounts | 9 | 3 | 20 | 0 | 6 | 23 s | < 30 s |
| F4 See what I owe and record paying it back | 5 | 0 | 0 | 1 | 6 | 14 s | balance in < 5 s |
| F5 Correct a wrong group-expense amount | 6 | 1 | 4 | 0 | 4 | 13 s | direct edit |

F4: the Home balance headline was on the first screen (at the bottom); on the
group screen, "Settle balance" sat below three repeated debt summaries on the
Balances tab and needed a scroll (`docs/ux/before/before-F4-04-balances.jpg`).
An earlier run of this table reported "below the fold, 7 scrolls"; that came
from a faulty visibility probe (`isHittable` is false for plain text in a
card) and was re-measured with a frame check in both builds.

## Strengths to keep

- Guest mode is real: personal expenses, receipts and "Describe it" work with
  no account; the account is explained, not forced.
- The personal expense form is the model to copy: amount autofocused, Save in
  the header, category suggested from the description, delete with **Undo**,
  discard confirmation only when something was typed.
- Financial safety: payer/share sums enforced in SQL; idempotent client ids;
  compare-and-swap edits; large-amount confirmations; settle-up re-checks the
  live balance and says "Talli doesn't send money".
- Sharing privacy: 256-bit regenerable links, opt-in and masked payment
  details, noindex/no-store public pages, "I've paid" stays pending until the
  creditor confirms.
- The Assistant reuses the screens' mutation functions, never computes money,
  and every write needs Confirm.
- Native tab bar, native action sheets with destructive items last, Reduce
  Motion respected, dark mode tokens.

## Findings

Severity: **P0** broken journey, financial correctness, data loss, misleading
money, inaccessible critical action · **P1** unnecessary steps, confusing
navigation, poor defaults, weak recovery, accessibility gaps · **P2** polish.
"V" = verified in code or by probe; "S" = needs a device to confirm.

### P0

| # | Journey | Current behavior (evidence) | Impact | Fix |
|---|---|---|---|---|
| U1 | Groups / remove member | "Remove from Group" hard-deletes the `group_members` row (`services/members.ts:74`); FKs cascade to `expense_participants`, `expense_payers`, `payments`. **Probe:** ₱300 taxi split Ana/Carla, delete Carla → expense still ₱300, shares now ₱150. No guard trigger. (V) | Balances silently stop summing to zero; every member's numbers change. | DB trigger refusing to delete a member who has expenses or payments (account-closure and whole-group deletes still allowed); app explains why and keeps them. |
| U2 | Receipt review | Item amount input is controlled by `(total_cents/100).toFixed(2)` and re-parsed on every keystroke (`ReceiptItemEditor.tsx:180`). Typing after the reformat yields "1.002" → null → field clears; backspace re-adds ".50". (V by code) | The only way to correct a misread line doesn't work, so wrong amounts flow into splits. | Keep a text buffer per row; parse on change without reformatting, format on blur. |
| U3 | Payment details | If loading fails the form stays editable and Save upserts empty fields (`account/payment.tsx:49-51, 216`). (V) | One flaky load + Save erases GCash/bank details others rely on. | Full-screen error with Retry; no form until loaded. |
| U4 | Public `/p` page | `FriendView.tsx:285` `isPaid = !owes`: a member who is *owed* money sees "All Settled!" beside "You're owed ₱X". (V) | Contradictory money message on the page people open from chat. | Third state: "₱X is owed to you". |
| U5 | Public `/p` page | Masked numbers print `****1234` and the Copy button copies the asterisks (`ProfilePaymentDetails.tsx:32-68`). (V) | The main pay action fails by default when there's no QR. | Same masked handling as `/g` ("account ending in 1234", no Copy, "scan the QR or ask"). |
| U6 | Public `/g`, `/p` | Organizer-entered details (`source: 'organizer'`) are not labelled on web; mobile labels them. (V) | A debtor may pay an unconfirmed account number. | "Added by the organizer — not confirmed by {name}". |
| U7 | Share group summary | Group menu "Share Group Summary" only checks `share_token` (`groups/[id]/index.tsx:182`); a turned-off link still has a token. (V) | Members post links that open a 404. | Check `share_enabled`; explain when off. |
| U8 | Friends list | Balance query error → `net = 0` → "Settled up" (`FriendsList.tsx:16-27`). (V) | Says nobody owes anything when it doesn't know. | "Balance couldn't load". |

### P1 — the five measured flows

| # | Flow | Current behavior | Why it's friction | Fix |
|---|---|---|---|---|
| U9 | F1 first launch | Welcome → currency → account choice; *Create Account* is the filled primary, "Continue Without an Account" a text link (`onboarding.tsx`). | 3 screens / 3 taps before Home; promotes sign-up over use. | One screen: value, main currency (pre-selected from region, changeable inline), **Start Using Talli** primary, "I have an account" secondary. |
| U10 | F2 group expense | "Smart add" banner + 5-segment mode control above Amount (`add-expense.tsx:826-856`); amount not focused; Save at the bottom; then a full "Confirm Expense" screen (`:755-818`). | 2 extra taps + 1 scroll + 1 screen; 5 modes to decode before typing. Personal form already does it better. | Same pattern as the personal form: amount focused, **Save in the header**, no confirm screen (Undo toast instead), Scan/Describe as small assist buttons, unequal/itemized splits behind "Split differently". |
| U11 | F2 entry point | + → "Split with a Group" → pick group (`useAddMenu.ts`). | Repeat expenses usually go to the same group. | Add-menu shortcut "Split with {last group}" (remembered per account). |
| U12 | F2 payer | Payer chips are names in member order; your own chip says "Ana", not "You". | Ambiguous on shared devices; slows scanning. | "You" first. |
| U13 | F3 create group | Create → land on group → "Add people" → settings scrolled to a field → Add per name → Back. | 4 taps and a detour through the settings screen. | Optional "Who's in?" names field on New Group; people are added with the group. |
| U14 | F4 home | Signed in: personal month card + buttons + recent expenses before "Your balance with others" (`home/index.tsx`). | The headline is at the bottom of the first screen; who you owe and each group's position are below the fold. | Put shared balances first when there's anything shared. |
| U15 | F4 group hero | Hero = "Still owed in this group ₱900"; your position is the small subline (`groups/[id]/index.tsx:656-686`). | The number you care about is secondary. | Hero = *your* position ("You owe Carla ₱450") with a **Settle Up** button right there. |
| U16 | F4 balances tab | Banner "You can settle with 2 payments", "Who owes whom", "Suggested settlements" (same rows again), "Total to pay", "Settle balance", then member list (`DebtSummary.tsx`). | Same debts shown three times; CTA six scrolls down. | One "Who owes whom" list; Settle per row; remove the duplicate card and banner. |
| U17 | F4 shared tab | Group cards show the group total "₱900 open" (`shared/index.tsx`), Home's cards show "You owe ₱450". | Inconsistent and not personal. | Show your position per group, as Home does. |
| U18 | F5 fix mistake | Group expense rows aren't tappable; 16pt comment / pencil / ✕ icons side by side; rows don't show who paid or your share (`ExpenseList.tsx`). | Tiny targets, delete beside edit, no context to spot the mistake. | Whole row opens edit; row shows "You paid · you lent ₱200" / "Carla paid · you owe ₱450"; delete moves into the edit sheet. |
| U19 | Remind | Bell shows on every debt row, including your own debts (`DebtSummary.tsx:120`), ~35pt target. | You can "remind" yourself. | Only on rows where someone owes you; 44pt. |

### P1 — other journeys

| # | Journey | Finding | Fix |
|---|---|---|---|
| U20 | Guest → account | After "Not Now" on the import prompt, guest expenses appear only in the Account tab (`GuestImportPrompt.tsx`, `account/index.tsx:295`); Home/Spending look empty. (V) | One line on Home: "N expenses from before you signed in · Add". |
| U21 | Friends | A friend ledger opens the full group screen and settings: invite code, Add Member (server rejects it), budget, archive. (V) | Hide group-only controls for two-person ledgers. |
| U22 | Accessibility / contrast | Primary buttons white on #059669 = 3.77:1; success text #10b981 on white = 2.54:1; warning badge 1.93:1; success badge 2.24:1. (V, WCAG formula) | Darker fill for primary buttons; `success` text token to #047857; badges use the `*Dark` text tokens. |
| U23 | Public pages | Invalid, revoked and rate-limited links show the app's generic 404 with "Back to dashboard" (`g/[shareToken]/page.tsx:39`). (V) | Route-level not-found: "This link was turned off or replaced. Ask whoever sent it for a new one." |
| U24 | Assistant | "I paid Mia back 500" reads the name as "Mia back" (case-insensitive NAME regex, `rules.ts:136`); "Settle up with Mia" unsupported. (V by probe) | Case-sensitive second name word; settle phrasing rule (documented; eval required). |
| U25 | Assistant / receipt | Group Receipt mode opens the camera before checking Apple Intelligence (`add-expense.tsx:1021`); personal form checks first. (V) | Same availability gate as the personal form. |
| U26 | Settings | ~10 sections and four kinds of link on one screen; "Unlinked" jargon; per-person invitation buttons repeated per member. (V) | Rename "Unlinked" → "Not on Talli yet" now; the full People/Sharing/Group split is P2. |
| U27 | Group invite | Joining by code always adds a new member, even when a placeholder with the same name exists. (V) | Documented; needs a "Which of these is you?" step (product decision, P2). |

### P2 (recorded, mostly deferred)

Receipt "person-first" item assignment; Assistant "Edit" on previews and
personal edit/delete; settings restructure; per-route `loading.tsx` on public
pages; register confirm-password field; VoiceOver time extension for the Undo
toast; Dynamic Type single-line amounts in Activity/Friends; `gray400` hint
text contrast (2.54:1) — a token change touching ~150 call sites, scheduled
separately.

## Information architecture

Tabs (Home · Spending · Shared · Assistant · Account) are sound and match the
mental model "my money / shared money / help / me". No tab change is
proposed. The problems are *ordering inside screens* (U14, U15, U16) and
*ceremony inside forms* (U9, U10, U13), not navigation structure. The
Assistant tab and receipt scanning stay optional: every essential action has a
conventional control.

## Known limitations and unverified assumptions

- Apple Intelligence behaviour (receipt OCR, model fallbacks) was not run on a
  physical device in this pass; the simulator exercises the rules path.
- Time estimates are model-based. Real first-time users read more slowly and
  hesitate; the validation report includes a protocol to measure that.
- Web pages were reviewed in code; their changes are checked by unit tests and
  a browser render, not by phone users.
