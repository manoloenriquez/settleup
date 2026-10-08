# Talli Assistant — design

Status: approved for implementation 2026-10-08 (owner brief); this file is the
engineering design. Benchmarks live in `docs/ai/AI_BENCHMARK_RESULTS.md`.

## Goal

A conversational page that does what the app already does — add, find, edit
and delete expenses, record payments, manage groups and members, answer
balance and spending questions — on the iPhone, on the device, offline where
the underlying operation is offline-capable. It is another way to use the
existing app, never a separate ledger.

## Non-negotiables

1. The model interprets language. It never computes money, never picks ids,
   never executes anything. Deterministic code resolves names, dates, amounts
   and splits (`packages/shared`), and existing hooks/services execute.
2. Every write is shown as a preview card and needs an explicit **Confirm**.
   Reads run immediately. Nothing the model says is reported as a result; the
   result card is built from the service response (`Saved`, `Saved on this
   iPhone — will sync`, `Failed: …`).
3. No new data path: writes go through the same hooks as the screens, so RLS,
   the offline outbox, CAS conflict detection and product events apply
   unchanged. Authorization is enforced by the server (RLS + definer checks);
   the assistant additionally only offers actions the UI would offer (e.g.
   delete only for the creator), so it never invites a server refusal.
4. On-device only (FoundationModels). No cloud fallback. When Apple
   Intelligence is unavailable, a deterministic rules interpreter handles the
   common patterns and says what it cannot do.

## Why guided generation, not the `Tool` protocol

FoundationModels supports `Tool` calling. We do not use it in v1:

- The data and every mutation live in JavaScript (React Query cache, outbox,
  personal ledger). A Swift `Tool.call` would need an async round trip back
  into JS per call, and the model would decide sequencing — the opposite of
  "the app validates, the user confirms".
- The system model has a 4,096-token context. Tool schemas for ~15 operations
  plus instructions, app context and history would consume most of it.
- The existing chat entry already proves the pattern: one `@Generable`
  interpretation per turn, mapped deterministically. Latency is one model call.

So each user turn makes **one** guided-generation call that returns an
`AssistantCommand` (an `action` enum plus flat optional slots). If benchmarks
show one schema is too broad, the fallback is a two-stage call (classify, then
action-specific extraction), decided by data, not up front.

## Pipeline (per user turn)

```
text (+ optional receipt) ─► Swift AssistantIntelligence.interpret
   instructions + compact context (today, me, currency, groups, friends,
   members of the focused group, last 4 turns, focus) ─► AssistantCommand
        │  (rules interpreter when Apple Intelligence is unavailable)
        ▼
packages/shared/src/assistant
   validate (Zod) → amount must appear in the user's words (anti-fabrication)
   → resolve group/people/expense against the app snapshot (exact/unique;
     ambiguity → choice chips; unknown → ask) → dates (resolveDateMention)
   → split (resolveSplit) → plan:
        answer   (read-only card computed from cached data)
        clarify  (one question + choices)
        propose  (write preview: what changes, risk level)
        refuse   (unsupported / not permitted, with the screen that does it)
        ▼
apps/mobile Assistant screen
   answer → render now · propose → card with Confirm/Cancel
   Confirm → executor → existing hook mutateAsync → result card from the
   real response (+ Undo where a safe inverse exists) → memory update
```

## Operations (derived from what the app can do)

| Action | Kind | Executes through | Offline | Undo |
|---|---|---|---|---|
| balances overview, balance with a person, group summary, list/find/largest expense, top payer, spending by category, explain a balance | read | React Query cache + `fetchQuery` (same keys as screens) | cached data | — |
| add group/friend expense (equal, percent, shares, exact, exclusions) | write | `useAddExpense` / `useAddExpenseCustomSplit` | queued (outbox) | delete (creator) |
| add personal expense | write | `PersonalLedgerContext.add` | local-first | `remove` |
| edit expense (amount, description, date, split) | write | `useUpdateExpense*` with CAS | queued | — (shows before/after) |
| delete expense | write, consequential | `useDeleteExpense` (creator only) | queued | — |
| record payment | write, consequential | `useRecordPayment` | queued | — |
| create group (+ members without accounts) | write | `useCreateGroup` + `useAddMembersBatch` | online only | — |
| add / remove member, rename group | write, consequential | members/groups hooks (owner/admin) | online only | — |
| open share link / payment details / settings | navigation | router | — | — |

Friends are two-person direct groups (`direct_group_id`), so friend expenses
and "John owes me 300" are group expenses in that ledger.

Not offered (no app capability or unsafe): converting currencies, changing an
expense's currency, undoing a payment (the server's "undo last" picks the
latest payment at execution time), anything on accounts other than the
signed-in one, sharing payment details by message.

## Context and memory

- **App snapshot** (built from cached queries, never sent anywhere): groups
  (id, name, currency, members), friends, current user's member id per group,
  recent expenses of the focused group. The model sees only names, never ids
  or amounts other than the user's own words.
- **Focus** (ids only): last group, last expense(s), last people, pending
  proposal. "that one", "it", "the dinner" resolve against focus first.
- **Transcript**: stored per account on the device (AsyncStorage, 40 messages,
  text and card summaries; cleared on sign-out with the account's other
  data and by "Clear conversation"). The last four turns' text go to the
  model; earlier turns survive only as focus ids.

## Risk policy

- Reads: run.
- Writes: preview card + Confirm. Consequential writes (delete, payment,
  membership, amount change) show before → after and use a destructive or
  prominent style. A proposal expires if the underlying data changed (CAS on
  edit; the executor re-resolves balances before a payment).
- Duplicate protection: each proposal has an id; Confirm is single-flight and
  the outbox/RPC idempotency key is generated once per proposal, so a double
  tap or retry cannot create two expenses.

## Evaluation

`tools/assistant-eval` runs the Swift interpreter on the Mac's copy of the
system model over `sample-inputs/assistant/cases.json` (authored utterances
with expected plans, English, Filipino and Taglish), then scores the full
TypeScript pipeline: action accuracy, slot accuracy (amount, payer,
participants, split, date, group), clarification correctness, incorrect
mutation rate, latency. The rules interpreter is scored on the same set as a
baseline. Security cases (other people's groups, ids in text, prompt
injection) must produce zero executable proposals outside the snapshot.

## Codex plan review (2026-10-08) — triage

| Finding | Decision |
|---|---|
| Delete has no CAS | **Accept.** At Confirm the executor re-reads the expense (server when online, cache when offline) and refuses if `updated_at` changed since the proposal; the remaining race window is the same as the Delete button's. |
| Hooks mint a new UUID per call, so a retry can duplicate | **Accept.** `useAddExpense*` and `useRecordPayment` take an optional `clientId`; the assistant passes the proposal id, so a retry replays the same RPC id. |
| Partial cached reads | **Accept.** Questions that need history load every expense page for the groups in scope when online (cap 1,000) and say "based on N loaded expenses" offline. |
| Group + members not atomic, not offline | **Accept.** Create group is online-only; members are added after and a failure is reported per name with Retry, never as success. |
| Payment currency/overpayment | **Accept.** Several currencies with a balance and none stated → ask. Amount above the current debt → the preview says so (same as the settle-up screen). |
| Transcript isolation | **Accept.** Key `talli:assistant:v1:<owner>`; purged with the account's other data and on sign-out. |
| "Creator only" delete is wrong | **Accept.** Edit/delete offered to the creator or a group owner/admin, matching RLS. |
| Expiry only for edits | **Accept.** Every proposal is re-resolved against a fresh snapshot at Confirm; any difference → "This changed — here's the updated version". |
| Analytics bypassed | **Accept.** The executor emits the existing `expense_saved`/failure events with entry mode `chat` (the database allowlist has no separate assistant value). |
| Guest behaviour | **Accept.** The tab is available to guests; personal operations work, group/friend/payment operations explain and offer Sign in. |
| Semantic validation | **Accept** (same as re-resolve at Confirm). |
| Foundation / eval assets absent | Reject — they are the work this design describes, not defects. |
