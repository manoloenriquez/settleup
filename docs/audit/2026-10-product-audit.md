# Talli product, UX, architecture and reliability audit

**Date:** 1 October 2026 · **Baseline:** tag `pre-audit-2026-10-01` (branch `baseline/pre-audit`, commit `a6d7ee0`) · **Work branch:** `audit/talli-v1`

This document records what Talli is today, what is wrong or missing, the user
model we are moving to, and the phased plan. It was written before any product
change and is updated at the end of each phase (see *Status*).

## 0. Baseline

| Check | Result |
|---|---|
| `pnpm typecheck` | 7/7 packages pass |
| `pnpm lint` | 7/7 pass (mobile at `--max-warnings 0`) |
| `pnpm test` | shared 251, mobile 70, ai 24, web 39 — all pass |
| iOS Release build (iOS 27 SDK) | builds, launches on the iOS 27 simulator; build 1 is on TestFlight |
| Known warnings | missing dSYMs for prebuilt React/Hermes frameworks on upload (harmless) |
| Known broken | nothing known broken; the signed-in receipt → save flow has never been exercised end-to-end on a device |

Live database (`melogtpslinfzphvptyu`, shared with other apps): 18 groups, 68
members (52 without an account), 76 expenses, 52 payments, 2 group owners, 1
payment profile. Applied: everything up to
`20260908160541_preserve_shared_ledgers_on_account_closure`. **Not applied:**
`20260908163441_currency_ledger`, `20260909120000_push_delivery_payload`,
`20260909130000_product_events`.

## 1. Product map (as found)

```
Launch ─ RouteGuard (app/_layout.tsx)
  ├─ no session ─────────────► (auth) login / register / forgot / update-password
  │                              └─ Google OAuth (no Sign in with Apple)
  ├─ deep links (no guard) ──► /join?code  /claim?token  /auth/callback
  └─ session ────────────────► (protected)/(tabs)
        Home (dashboard) ── balances across groups, recent activity, bell → Activity
        Groups ─────────── list, search, archived, Join, New
        (+) ────────────── 0 groups → New group · 1 group → add expense · 2+ → Groups tab
        Activity ───────── all expenses/payments
        Profile ────────── payment settings, edit profile, push toggle, AI status,
                           feedback, sign out, delete account
        (scan) ─────────── hidden tab: a full receipt wizard nothing links to
     groups/[id] ─ Expenses / Balances / Charts · edit modal · comments · settle-up
                   overview (public-link preview + Share Link) · insights
                   settings (name, invite, members, roles, categories, budget,
                   recurring, CSV export, leave/archive)
     groups/[id]/add-expense ─ Quick · Chat (AI) · Receipt (AI) · Detailed · Itemized
     account/payment ─ one GCash + one bank profile per user, QR images

Web (Next.js): same organizer surface + public /g/<group token> and
/p/<member token> pages (+ "I've paid" report), /claim, /join, admin.

Supabase (schema settleup): groups ─< group_members (user_id nullable) ─< expenses
  (payers, participants, items) · payments (PAID / PENDING / REJECTED) ·
  user_payment_profiles (per user) · member_claim_invitations (hashed, 7 days) ·
  categories · recurring · comments · push_tokens · public_write_limits.
Money = integer minor units everywhere; SQL enforces payer and share sums.
AI = on-device only (Apple Intelligence, iOS 27), see docs/brain/05.
Offline = persisted React Query cache + idempotent outbox (13 mutation kinds).
```

### What already satisfies the brief

- **External participants.** `group_members.user_id` is nullable; 52 of 68 live
  members have no account. They take part in expenses, splits, balances and
  payments. Not modelled as fake users.
- **Claiming.** Admin mints a 256-bit, hashed, 7-day claim link for one
  unlinked member; `claim_member_with_token` links it without touching ledger
  rows. The old ID-based `claim_member(uuid)` is disabled.
- **Read-only share links.** `/g/<token>` (group) and `/p/<token>` (member) need
  no account. Anonymous viewers can only file a *pending* "I've paid" report,
  which the creditor confirms; rate-limited in SQL.
- **Ledger correctness.** Integer cents; deterministic largest-remainder splits
  (equal, percent, shares), property-tested; payer/share sums enforced by the
  RPCs; debt simplification is display-only; idempotent client IDs and
  `updated_at` compare-and-swap for edits.
- **Offline.** Durable outbox, exact-once replay, conflict and terminal-error
  recovery UI, per-account cache and queue keys.
- **On-device AI.** Receipt OCR + guided generation + deterministic
  reconciliation with verified/likely/needs-review states; chat entry; smart
  split; insights. No cloud AI.

## 2. Findings

Severity: **Critical** = data loss, security breach or a core promise broken;
**High** = a primary journey fails or confuses; **Medium** = friction or latent
risk; **Low** = polish.

### Critical

| # | Problem | Flow | Impact | Root cause | Fix |
|---|---|---|---|---|---|
| C1 | Talli is unusable without an account: first launch lands on a login wall. | First run | Most new users leave before seeing value; contradicts "useful before signup". | Every screen lives under `(protected)`; there is no personal (non-group) expense concept at all. | Guest mode with a local-first personal ledger; onboarding; account optional (Phases 2–3). |
| C2 | Sign-out silently strands unsynced changes. | Sign out with pending outbox items | Offline expenses/payments are lost if the user then signs into another account or reinstalls. | `handleSignOut` ignores `usePendingCounts()`. | Warn with the count; offer "Sync first" (Phase 1). |

### High

| # | Problem | Flow | Impact | Fix |
|---|---|---|---|---|
| H1 | Public `/g` and `/p` pages have no `noindex` and no `Cache-Control: private, no-store`. | Share link | A link pasted publicly can be indexed or cached by a proxy: names, amounts, masked accounts, QR codes. | `robots` metadata + `X-Robots-Tag` and no-store headers for `/g/*`, `/p/*`, `/claim`, `/join` (Phase 1). |
| H2 | A group share link cannot be disabled or regenerated, and the group token is only 64-bit. | Share group summary | Once shared, a link is permanent; no response to a leak. | `rotate_group_share_token` (256-bit) and `set_group_share_enabled`; "Manage shared link" UI (Phase 5). |
| H3 | No control over which payment details appear on shared links; QR images are served from a public bucket and are shown to anyone with a group link. | Payment privacy | Bank/GCash QR (which encodes the full account) is exposed on every group link where the owner is a creditor. | Per-user "show on shared links" switch (default on only for masked text + QR, explicit), per-group opt-out; payloads omit details when off (Phase 5). |
| H4 | External members cannot have payment details. | Authenticated user owes an external member | Payer has to ask "what's your account number?" — the exact problem Talli exists to remove. | `member_payment_details` set by an admin, labelled "Added by <name>, not verified" (Phase 5). |
| H5 | No Sign in with Apple while Google sign-in is offered. | App Store review | Guideline 4.8 rejection risk for public release. | `expo-apple-authentication` + Supabase `signInWithIdToken` (Phase 3; provider must be enabled in the Supabase dashboard). |
| H6 | The (+) button sends users with two or more groups to the Groups tab. | Add expense | The primary action takes 3+ taps for most active users and does something different from its icon. | Add sheet: Personal expense · Scan receipt · Group expense (with a group picker) (Phase 4). |
| H7 | Denied camera/photo/notification permission is a dead end. | Receipt scan, push | Feature becomes unusable with no explanation. | Detect `denied`, explain, offer "Open Settings" (`Linking.openSettings`) (Phase 1). |
| H8 | Currency is hard-coded: `₱`, `en-PH`, `parsePHPAmount`, `AmountInput` prefix, ~50 call sites. The multi-currency engine (`currency.ts`) and ledger migration exist but are unused / unapplied. | All money display | Any non-PHP amount would be shown and rounded as pesos. JPY/KRW would gain two phantom decimals. | Currency-aware formatting everywhere (`formatMoney(minor, code)`); explicit currency on every personal expense now; group currency via the currency-ledger migration (Phase 6). |
| H9 | No friends or one-to-one ledgers. | Split with one person | Users create a two-person "group" by hand; no friend list. | Friends via invite link (no user search), each friendship backed by a two-member *direct* ledger that reuses the group ledger (Phase 7). |

### Medium

| # | Problem | Fix |
|---|---|---|
| M1 | Orphaned `scan.tsx` (552 lines) duplicates Receipt mode; nothing links to it. | Reuse it as the single receipt entry for personal expenses or delete it (Phase 4). |
| M2 | Group Settings is a kitchen-sink screen; inline text "buttons" (Rename, Remove, Make admin, Up/Down/Color) have no button role and ~14pt hit areas. | Real buttons with labels and ≥44pt targets; group into sections (Phase 8). |
| M3 | Sign-out leaves the previous account's query cache and outbox on disk (unreadable by other accounts, but not deleted). `scope: "local"` does not revoke the refresh token. | Purge the account's keys after a clean sign-out; global sign-out for the explicit action (Phase 1). |
| M4 | `recurring_expenses` RLS lets any member edit or delete anyone's recurring template. | Creator-or-admin policies (Phase 5). |
| M5 | No upper-bound sanity check on amounts. | Confirm above a large threshold; hard cap at the DB `bigint`/safe-integer range (Phase 4). |
| M6 | No Dynamic Type policy; fixed-height controls and single-line money text clip at large sizes. | Allow scaling with sensible caps on tight layouts (Phase 8). |
| M7 | No onboarding; register ends in a "check your email" wait with nothing to do. | Onboarding + guest mode means the app is useful while the email is pending (Phase 2). |
| M8 | Group "…" menu mixes a destructive action (Undo my last payment) between benign items. | Native action sheet with the destructive item last (Phase 8). |
| M9 | Public read paths are rate-limited in memory per instance only. | Acceptable for beta; token entropy is the real control (256-bit after H2). Documented. |
| M10 | Group member-row "Add" button opens full Settings. | Route to the add-member section (Phase 8). |
| M11 | Deleting a member/closing an account keeps QR files in the public bucket forever. | Delete replaced QR objects when a profile changes (Phase 5). |

### Low

| # | Problem | Fix |
|---|---|---|
| L1 | Public overview footer still shows an "S" (Settle Up) tile. | "T" / wordmark (Phase 1). |
| L2 | Dashboard bell icon opens Activity, not notifications. | Use the Activity icon (Phase 8). |
| L3 | Light mode only; `StatusBar style="auto"` suggests otherwise. | Documented; dark mode is Phase 8 stretch. |
| L4 | `public.ai_rate_limits` / `consume_ai_rate_limit` still exist; only web receipt OCR uses the limiter. | Keep (web OCR still uses it). |
| L5 | Stale settle-up amount when balances change between list and confirm. | Re-validate against the current balance on submit (Phase 4). |

### Findings that turned out to be false

- "Deleting an expense has no confirmation" — `ExpenseList` confirms before
  calling `onDelete` (`src/components/groups/ExpenseList.tsx:46`).

## 3. Architecture findings

**Guest/local storage.** None exists. The app's only local state is the
per-account React Query snapshot and outbox. Services call Supabase directly and
RLS keys everything to `auth.uid()`; groups cannot sensibly run without an
account because every other participant needs a server to see them.

**Authentication.** A single `RouteGuard` sends every signed-out user to login.
Email/password and Google; no Apple. Sessions in the Keychain. Account deletion
is a user-JWT soft close that preserves shared ledgers.

**Synchronisation.** Strong for groups (idempotent RPCs, CAS, outbox). Nothing
for personal data because there is none.

**Groups and participants.** Already `Group → GroupMember → optional User`.
Keep it. Roles: owner/admin/member; expense edit = creator or admin; delete =
creator; payment resolution = recipient or admin. These are intentional and kept.

**Ledger.** One ledger model (expenses + payments per group). One-to-one
expenses should reuse it as a two-member *direct* ledger rather than a second
financial model.

**Currencies.** Every stored amount is integer minor units. The live database
has no currency column; the (unapplied) currency-ledger migration adds
`currency_code` to groups/expenses/payments/recurring/budgets, versioned `_v2`
RPCs that compute each currency separately, and guards that make legacy RPCs
refuse foreign rows. Activating it needs every client read path moved to the
`_v2` RPCs first.

**Apple Intelligence.** Audited in depth on 1 October (docs/brain/05). Fully
on-device; availability states handled; manual flows remain. Gaps: only
reachable inside a *group's* add-expense screen, so guests and personal
spending never benefit.

**Supabase/RLS.** No cross-tenant read or write hole found in live policies.
Anonymous surface = four token-scoped definer RPCs. Items to fix: recurring
template RLS (M4), group token entropy/rotation (H2), payment detail exposure
(H3).

## 4. User model

| Capability | Guest (no account) | Signed in |
|---|---|---|
| Onboarding, default currency | ✓ | ✓ |
| Personal expenses: add, edit, delete, history, search | ✓ local | ✓ local-first, synced |
| Receipt scan, chat entry, categories (Apple Intelligence where available) | ✓ | ✓ |
| Spending summary by month/category, per currency | ✓ | ✓ |
| Multiple currencies per personal expense | ✓ | ✓ |
| Groups, invites, external members, balances, settle up | — explain + Create account | ✓ |
| Friends and one-to-one ledgers | — explain + Create account | ✓ |
| Share links, payment profile | — | ✓ |
| Multi-device, recovery | — | ✓ |

**Reasoning.** Everything that touches only the user's own data works locally
and needs no identity. Anything another person sees (groups, friends, links,
payment details) needs an identity so RLS can protect it; a local-only group
would give other participants nothing to open. Anonymous Supabase accounts
were rejected: they create cloud records the user never agreed to and complicate
deletion.

**Guest → account.** Personal expenses live in a device store (source of
truth on the device). On sign-in or sign-up the user sees how many local
expenses exist and chooses **Add to my account** (default) or **Not now**.
Adding marks each record pending; a sync engine upserts them into a new
`settleup.personal_expenses` table keyed by the client UUID (idempotent, so
interrupted uploads simply resume and never duplicate). Local records are never
deleted because of sync; the device copy becomes the account's local cache.
"Not now" leaves the guest store untouched; it can be imported later from
Settings and comes back if the user signs out. Sign-out deletes the *account*
cache from the device (after warning about unsynced items) so the next person
sees only guest data.

Personal expenses deliberately do **not** use a one-member group: they would
appear in group lists, dashboards, balances and share links, all of which would
need special cases, and they never need splits.

## 5. UX recommendations (screen level)

- **First run:** Welcome (one sentence of value) → Default currency (preselected
  from the device region) → Account (benefits list; *Create account*, *Sign in*,
  *Continue without an account*). No carousel.
- **Tabs (system tab bar):** Home · Spending · Shared · Account. "Add expense" is a
  nav-bar "+" on Home/Spending/Shared plus a prominent button on Home.
  - *Home*: this month's spending, recent personal expenses; for signed-in users
    also net group balance and groups needing attention.
  - *Spending*: searchable personal history grouped by month.
  - *Add*: native sheet with **Add expense**, **Scan receipt**, **Split with a group**.
  - *Shared*: groups (and friends) — guests see an explanation card with
    Create account / Sign in / Not now.
  - *Account*: guest → preferences + create account; signed in → profile,
    payment details, preferences, sign out, delete.
- **Personal expense form:** amount (currency chip beside it), description,
  category chips (auto-suggested), date (today), optional notes, optional
  receipt. One primary button: **Save expense**.
- **Receipt:** keep the verified/likely/needs-review review; for personal
  expenses map the total, merchant, date, category.
- **Groups:** "Share group summary" sheet: explanation of who can see what,
  Copy link, Share…, Regenerate link, Turn off link; payment-detail visibility
  stated before sharing.
- **Permissions:** request at the moment of use; denied → explanation + Open Settings.

## 5a. Apple design review (apple-design skill, translated to native iOS)

The skill's rules are written for the web; on iOS the platform already
supplies most of them (springs, interruptible sheets, velocity hand-off,
materials) *if* the app uses native components instead of re-drawing them.
The review therefore asks, screen by screen, where Talli re-implements a
system control in JavaScript and loses those properties.

| Principle | Where Talli falls short | Change |
|---|---|---|
| Familiarity / consistency | Tab bar is a JS re-drawing: labels hand-rendered, a "+" pseudo-tab that never selects and routes to three different places depending on group count, tab label "Profile" opens a screen titled "Account". On iOS 27 it has none of the system tab bar's material, sizing or accessibility behaviour. | System tab bar via `expo-router/unstable-native-tabs` (SF Symbols, translucent material, Dynamic Type for free). The add action becomes a real button (nav-bar "+" and a prominent in-content button), not a fake tab. |
| Specific labels | "Home", "Groups", "Profile", "Public overview", "Share Link", "New", "Join", "Continue". | Tabs named for contents: **Home** (overview), **Spending**, **Shared**, **Account**. Buttons say what they do: "Add expense", "Scan receipt", "Create group", "Join with a code", "Share group summary". |
| Interruptibility / spatial consistency | Edit-expense, pending-changes and several pickers are custom RN `Modal`s: slide from the bottom with a fixed animation, no interactive swipe-to-dismiss, no detents. Group actions use an `Alert` list. | Present forms as native `formSheet` / `modal` stack screens (interactive dismiss, detents, keyboard avoidance handled by UIKit). Action menus via `ActionSheetIOS` with the destructive item last. |
| Response | Inline `Text onPress` actions (group settings) give no press feedback and have ~14pt hit areas. | Real buttons with pressed state and ≥44pt targets (`hitSlop` where the visual must stay small). |
| Agency / forgiveness | Every delete is guarded by an alert, including reversible ones; nothing offers undo. | Personal expense delete → immediate, with an **Undo** toast (tombstone makes it reversible). Keep alerts for irreversible or shared-ledger deletes. |
| Multimodal feedback (utility) | Haptics used ad hoc in 8 screens. | One helper: success on save, warning on destructive confirm, selection on chip/segment change; nothing else. |
| Typography / flexibility | Fixed point sizes, no Dynamic Type policy, single-line money text clips. Root screens use small titles. | Let text scale; cap only where layout is fixed (tab labels, amount keypad); large titles on root tab screens. |
| Reduced motion | Not considered. | Skeleton shimmer and custom transitions respect `useReducedMotion`. Native transitions already follow the system setting. |
| Craft (light/dark) | Light-only palette exported as constants. | Documented gap; dark mode needs a themed-style pass across ~60 files and is scheduled after the functional phases. |
| Wayfinding | Hidden `scan` tab route reachable by nobody; "Add" avatar in the member row opens full Settings. | Remove dead routes; every control lands where its label says. |

## 6. Implementation plan

Order is driven by dependencies and by risk to real data: first things that
cannot break the live ledger, then local-only features, then schema changes.

| Phase | Scope | Schema change |
|---|---|---|
| 1 Reliability & safety | Sign-out pending-changes guard; purge the account cache only when its queue is empty; noindex/no-store on public pages and service-worker exclusion; permission denied → Open Settings; "S" logo | none |
| 2 Guest mode + onboarding | Local personal ledger (types/schemas/utils in `packages/shared`, mobile store), onboarding with default currency, system tab bar, account-required gating, personal add/edit/delete/undo/history/summary, receipt + chat entry for personal expenses, currency-aware formatting | none |
| 3 Accounts & migration | `personal_expenses` table (SELECT RLS; SECURITY DEFINER upsert with `auth.uid()` checks; server-arrival wins; tombstones never resurrected; currency limited to the supported set); sync engine; guest → account import with per-row server acknowledgement; Sign in with Apple | additive migration |
| 4 Expense UX | Add sheet with group picker; retire the duplicate `scan.tsx`; settle-up re-check | none |
| 5 Multi-currency groups | Groups have a default currency; any expense may use another (travel). Balances, settle-up and public pages per currency — never summed or converted. Header `x-ledger-version: 2` on every client incl. `apps/api`; all reads/writes on `_v2`; recurring templates carry currency. Rollout DB-first (all existing data is PHP, so old clients keep working until a new client creates non-PHP data). | apply existing migration + small additive one |
| 6 Groups & sharing | Group link rotate/disable (256-bit), share sheet; payment-detail visibility across *every* public endpoint; external member payment details; QR replace ordering | additive migration built on the currency-ledger function bodies |
| 7 Friends & one-to-one | Friend invite links, friendships (unique pair, idempotent accept), direct two-member ledgers; removing a friend hides the link and never changes the ledger | additive migration |
| 8 Polish & accessibility | Native sheets/action sheets, settings restructure, touch targets, labels, Dynamic Type, reduced motion | none |
| 9 Validation | Journeys A–G and external-member scenarios 1–8 | — |

Deferred: recurring-template RLS tightening (M4) — needs server-side enforcement
and a rule for templates whose creator closed their account.

### Codex plan review (1 October) — triage

Accepted: definer RPC for personal writes (the INVOKER design could not
write); currency migration before client `_v2` use and before any public-RPC
change; `x-ledger-version` header; never purge an account queue that still has
entries; reuse the persister key helpers; server-arrival-wins instead of
client-clock LWW; defer recurring RLS; friend removal does not freeze the
ledger; no route-group rename; per-row import acknowledgement; supported
currency set only; one personal amount cap; service-worker exclusion; redact
every public endpoint; QR replace ordering; Apple sign-in dependencies;
convention-aligned module placement; regenerated types and SQL tests.
Rejected: server-side settle-up balance check — an overpayment reverses the
balance direction but never corrupts the ledger.

Each phase: typecheck, lint, tests, iOS build where native code changed,
Codex review, commit. Schema changes are applied to the live project only as
additive migrations, never by editing applied ones.

### Codex plan review of phase 5 — triage

Accepted: keep the migration's multi-currency groups instead of a
one-currency invariant (default currency per group, per-currency balances);
no combined live dry run; DB-first rollout; header on the API client so
account closure works for non-PHP ledgers; no naive per-currency merging;
cover group creation, payments, outbox, recurring, activity, insights,
export, parsers and tests. Rejected: server-side single-currency
enforcement (moot once groups may hold several currencies).

## 7. Status

- 2026-10-01: audit written; baseline tagged.
- Phase 1 (`3b53e9c`): sign-out guard, device cleanup, public-link headers, permission recovery.
- Phase 2 (`7517db6`): guest mode, onboarding, native tabs, personal expenses. XCUITest journey A passes on the iOS 27 simulator.
- Phase 3 (`18e6560`): `personal_expenses` applied live; sync; guest → account import; Sign in with Apple (flagged off until the provider is configured).
- Phases 4 + 8 polish (`15784f4`): Record a Payment live-balance check, row action menus, Reduce Motion, device-locale dates.
- Phase 5: currency ledger + lookup helpers applied live (owner approved); mobile and web on per-currency `_v2` RPCs; default currency per group, any currency per expense; CSV export per row currency.
- Phase 6: share-link rotate/disable, opt-in and masked payment details on shared pages, per-group hide, organizer-entered details for members without accounts; fixed a pre-existing bug where saving mobile payment details failed on any empty field and dropped QR codes.
- Phase 7: friends via single-use invite links (no search), two-person direct ledgers, friend list with balances, web `/f/<token>` and app `talli://friend` acceptance.
- All SQL suites pass on the live schema (rolled-back runs).

## 8. Final validation (1 October 2026)

How each journey was verified. "Simulator" = automated XCUITest on the iOS 27
simulator (`tools/ui-driver`, fresh install per journey). "Live SQL" = the
real RPCs and RLS on the live project inside a rolled-back transaction
(`supabase/tests/*.sql`). "Unit" = Vitest.

| Journey | Result | Evidence |
|---|---|---|
| A Guest: onboarding → PHP → no account → add → edit → history → delete + undo → relaunch persists | Pass | Simulator `GuestJourneyTests` |
| B Guest upgrade: 50 local expenses → account → import once, interrupted upload resumes, guest copy freed only after every row is acknowledged | Pass | Unit `personal-sync.test.ts` (journey B), Live SQL `personal_expenses.sql` (ownership, replay, tombstones) |
| C Friend: invite → accept → ₱2,000 split equally → ₱1,000 owed → settle → zero | Pass | Live SQL `friends.sql` |
| D Group: A creates, B/C join by code, two members without accounts, three payers, custom + equal + odd-centavo split, edit, partial repayment, balances sum to zero and match hand arithmetic | Pass | Live SQL `group_journey.sql` |
| E Offline: queued writes replay exactly once (incl. entries from older builds), personal expenses are local-first | Pass | Unit `outbox-executor.test.ts`, `offline.test.ts`; local-first by design |
| F Currencies: PHP default, USD and JPY expenses keep their own currency and decimals, never summed | Pass | Simulator `CurrencyJourneyTests`; Unit `amount.test.ts`, `currency-ledger.test.ts`; Live SQL `currency_ledger.sql` |
| G Apple Intelligence: on-device receipt pipeline | Pass (earlier) / not re-run on a device | Eval suite on macOS 27 + iOS 27 simulator runtime (docs/brain/05); guest receipt + describe assists reuse it; unavailability shows the reason and keeps manual entry |

External-member scenarios: 1 (external members in balances), 3 (payment
details for an external member), 6 (removed details disappear), 7 (claim keeps
history and balances, no duplicate), 8 (multi-currency shared page) — Live SQL
`group_journey.sql`; 2, 4, 5 (view without login, disable link, regenerate
link) — Live SQL `sharing_and_payment_privacy.sql` + `public_payloads.sql`.

### Re-audit of the original findings

| Finding | Status |
|---|---|
| C1 Unusable without an account | Fixed (phase 2) |
| C2 Sign-out strands unsynced changes | Fixed (phase 1, extended to personal expenses in phase 3) |
| H1 Public pages indexable/cacheable | Fixed (phase 1; `/f` added in phase 7) |
| H2 Share links permanent, 64-bit | Fixed (phase 6) — existing links stay valid until an admin regenerates them |
| H3 Payment details exposed on links | Fixed (phase 6) — opt-in, masked, per-group hide, creditors only |
| H4 External members cannot be paid | Fixed (phase 6) |
| H5 No Sign in with Apple | Built, hidden until the Apple provider is enabled in Supabase |
| H6 (+) button behaviour | Fixed (phase 2 add menu with group picker) |
| H7 Denied permissions dead end | Fixed (phase 1) |
| H8 Currency hard-coded | Fixed (phases 2, 5) |
| H9 No friends / one-to-one | Fixed (phase 7) |
| M1 Orphaned scan screen | Removed |
| M2 Settings link density / targets | Fixed (phase 8) |
| M3 Cached data of other accounts | Fixed (phase 1) |
| M4 Recurring RLS | Deferred (needs server-side enforcement; documented) |
| M5 No amount sanity check | Fixed (large-amount confirmation, caps) |
| M6 Dynamic Type | Partly: native tab bar, labels and large titles scale; fixed-height custom controls remain |
| M8 Destructive item among benign | Fixed (phase 8) |
| M10 "Add" opens full settings | Relabelled "Add people" with a hint |
| L1 "S" logo | Fixed |
| L3 Dark mode | Not done (scheduled; ~60 files of static colours) |

### Not verified by me, needs the owner

- Signed-in flows on a physical iPhone (account creation is not something I
  may do on the live project): guest → account import prompt, friend invite
  between two phones, share sheet, payment-details screens.
- Apple Intelligence on a physical Apple Intelligence iPhone, online and in
  airplane mode.
- Sign in with Apple: enable the Apple provider in Supabase, then set
  `EXPO_PUBLIC_APPLE_SIGN_IN=true` for the next build.
- Web deployment and universal links (`IOS_TEAM_ID`, `IOS_BUNDLE_IDENTIFIER`,
  `talli://` redirect in the Supabase allowlist).
