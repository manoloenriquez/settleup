# Talli UX improvement plan

Findings and evidence: `docs/ux-audit.md` (IDs U1–U27). Results:
`docs/ux-validation-report.md`. Each task lists acceptance criteria that are
checked by a test, a measured flow or a stated manual check.

Principles for every change: copy the patterns that already work (the
personal expense form); remove steps that add no safety; never remove a check
that protects money (payer/share sums, large-amount confirmation, live-balance
re-check, AI Confirm); prefer recovery (Undo) over up-front confirmation for
reversible actions; no new dependencies; no navigation restructure.

## P0 — must fix

| Task | Finding | Change | Acceptance criteria | Risk / dependency |
|---|---|---|---|---|
| P0-1 | U1 | Migration `…_guard_member_history.sql`: BEFORE DELETE trigger on `settleup.group_members` raising `23503`-style error "has expenses or payments" when the member appears in `expense_participants`, `expense_payers`, `expense_item_participants` or `payments`; skipped inside account-closure transactions and when the parent group is gone (group delete cascade). Mobile/web show the message. | SQL test: delete with history fails, totals unchanged; delete without history succeeds; group delete still cascades. App shows "Carla is part of expenses or payments…" instead of silently doing nothing. | Needs live apply by the owner. Additive, no data change. |
| P0-2 | U2 | `ReceiptItemEditor`: per-row text buffer, parse without reformatting while typing, format on blur. | Unit test types "2","4",".","5" → 24.50 kept; backspace works. | — |
| P0-3 | U3 | Payment details: load error → full error state with Retry, no form or Save. | Code path: Save unreachable when `loadError`. | — |
| P0-4 | U4 | `/p` headline: owes / is owed / settled. | Web unit test renders "owed to you" state for a creditor. | — |
| P0-5 | U5 | `/p` masked numbers use the `/g` masked line; no Copy for masked values. | Web unit test: masked value has no Copy button. | — |
| P0-6 | U6 | Web payment cards label organizer-entered details. | Web unit test for `source: "organizer"`. | — |
| P0-7 | U7 | Group menu share checks `share_enabled`; when off, explains and offers the settings screen. | Code path covered; manual check. | — |
| P0-8 | U8 | Friends row: error → "Balance couldn't load". | Code path. | — |

## P1 — the five core flows

| Task | Flow | Change | Acceptance criteria |
|---|---|---|---|
| P1-1 | F1 (U9) | Onboarding becomes one screen: value points, main currency row (pre-selected, inline change), **Start Using Talli** (guest, primary), **I Have an Account** (secondary → sign in / create). | Measured F1: ≤ 4 taps, ≤ 4 screens (from 6/6). Existing guest journey updated and passing. |
| P1-2 | F2 (U10, U12, U25) | Group add-expense: amount autofocused; Save in the header; no Confirm screen — save directly, then a toast **"Added · Undo"** that deletes the new expense; "Smart add" banner and 5-segment control replaced by two assist buttons (**Scan Receipt**, **Describe It**) and a **Split differently** link (unequal / by item); receipt assist gated on Apple Intelligence availability; payer chips show **You** first; consistent field labels across modes. All validation (sums, large amounts) unchanged. | Measured F2 (repeat) from Home ≤ 5 taps, 0 scrolls, ≤ 4 screens (from 7/1/6). Unequal and itemized saves still pass (EditSplit/Group journeys, unit tests). |
| P1-3 | F2 (U11) | Add menu remembers the last group used per account and offers **Split with {group}**. | Measured in F2. |
| P1-4 | F3 (U13) | New Group: optional **Who's in?** field (comma-separated names); members added right after the group is created; your own name and duplicates ignored; offline creation keeps today's behaviour and says people can be added later. | Measured F3 ≤ 6 taps, ≤ 4 screens (from 9/6). Server check: 3 members. |
| P1-5 | F4 (U14) | Home: when signed in and anything is shared, **Shared balances first**, personal month summary after. | Measured F4: balance visible at launch, 0 scrolls on Home. |
| P1-6 | F4 (U15) | Group hero shows *your* position and your debts/credits with direct **Settle Up** / **Record Payment** buttons; group total becomes the subline. | Measured F4: settle from the group screen with no tab switch; total ≤ 4 taps, 0 scrolls (from 5 taps, 1 scroll). |
| P1-7 | F4 (U16, U19) | `DebtSummary`: one list; remove banner and duplicate "Suggested settlements"; reminder bell only where someone owes you, 44pt. | Balances screenshot shows each debt once. |
| P1-8 | F4 (U17) | Shared tab group cards show your position per group (from the dashboard summaries Home already uses). | Visual check; same numbers as Home. |
| P1-9 | F5 (U18) | Expense rows: whole row opens edit; subtitle "You paid · you lent ₱200" / "Carla paid · your share ₱100"; delete moves into the edit sheet (confirm kept, it's a shared ledger); edit amount field labelled. | Measured F5 ≤ 5 taps (from 6); EditSplit journey passes. |

## P1 — other journeys

| Task | Finding | Change | Acceptance |
|---|---|---|---|
| P1-10 | U20 | Home banner for unimported guest expenses with **Add** (same import as Account). | Code path; guest import tests unchanged. |
| P1-11 | U21 | Direct (friend) ledgers hide invite code, add member, budget, archive. | Code path. |
| P1-12 | U22 | Contrast: primary button fill #047857 (5.5:1), `success` light #047857, badges use dark text tokens. | Ratios recomputed ≥ 4.5:1; appearance tour screenshots. |
| P1-13 | U23 | Route-level not-found pages for `/g`, `/p` with plain recovery copy. | Web build; manual render. |
| P1-14 | U24 | Assistant rules: second name word must be capitalised; "settle up with X" → record payment of the outstanding amount is a **product decision** (amount not in the user's words) — only the name bug is fixed. | Shared assistant tests. |
| P1-15 | U26 | "Unlinked" → "Not on Talli yet". | Grep. |

## P2 — deferred, with reasons

| Item | Why deferred |
|---|---|
| Settings split into People / Sharing / Group | Large screen rewrite; P1-11 and P1-15 remove the worst confusion. |
| Receipt person-first assignment | Needs design + device testing with real receipts. |
| Assistant: Edit on previews, personal edit/delete, settle-with-balance | Changes the AI write contract; needs the owner's call and the macOS 27 eval suite. |
| "Which of these is you?" when joining by code (U27) | Product decision on claim UX. |
| `gray400` hint text contrast | Token change across ~150 call sites; schedule with a visual pass. |
| Toast duration under VoiceOver, register confirm-password, public page skeletons | Small; listed for the next polish pass. |

## Order and verification

1. P0-1 (migration + SQL test), P0-2, P0-3, P0-8 → commit.
2. P1-1 … P1-9 (the five flows) → simulator flows after each group → commit.
3. P0-4 … P0-7, P1-13 (web + share) → web tests/build → commit.
4. P1-10 … P1-15 → commit.
5. Full checks: typecheck, lint, all unit tests, web build, SQL suites on the
   local stack, existing XCUITest journeys (guest, group, edit, friend,
   currency, appearance in light/dark), `UXAfter*` flows; Codex code review;
   validation report.

Cache: no persisted query changes shape, so `CACHE_BUSTER` stays (checked per
task; bump if a query's data changes).

## Status (9 October 2026)

| Task | Status | Evidence |
|---|---|---|
| P0-1 … P0-8 | Done (commit `c4f58a4`). P0-1 applied live on 9 Oct 2026 and tested there (rolled back) | SQL suite `member_history`, web tests, browser screenshots, simulator journeys |
| P0-3 (web) | Done: Codex plan review found the same blank-form risk on web | `account/payment/page.tsx` |
| P1-1 … P1-9 | Done (commit `0bf73f9`) | `docs/ux-validation-report.md`: taps 33 → 21, screens 28 → 20 |
| P1-10 guest banner, P1-11 friend tabs, P1-12 contrast, P1-13 dead-link pages, P1-14 Assistant name, P1-15 terminology | Done | as above |
| Found during validation | New Group's Create button sat under the keyboard → header Create; edit sheet slid under the status bar → safe-area inset; unlabeled "2" badge on group cards → "· 2 still owe"; expense row label now includes the date | measured flows, journeys |
| P2 | Deferred (see the table above) | — |

Acceptance criteria met: F1 ≤ 4 taps/≤ 4 screens (4/4); F2 repeat ≤ 5 taps,
0 scrolls, ≤ 4 screens (4/0/4); F3 ≤ 6 taps, ≤ 4 screens (5/4); F4 ≤ 4 taps,
0 scrolls (3/0); F5 ≤ 5 taps (5).
