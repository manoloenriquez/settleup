# Talli — mobile ↔ web parity audit and roadmap

Date: 13 October 2026 · branch `feature/talli-rebrand-parity` (stacked on the
unpushed `feature/adaptive-budgeting`) · brand inventory: [`docs/brand/REBRAND.md`](../brand/REBRAND.md)

Everything here was read from source and, where marked **verified**, exercised
on this machine: the web app against the local Supabase stack in a browser,
the API route over HTTP, the SQL suites, and the unit/component tests. No user
research was done.

## 1. The two products today

| | iPhone app (`apps/mobile`) | Web app (`apps/web`) |
|---|---|---|
| Stack | Expo 54, Expo Router v6, `NativeTabs`; iOS 27 deployment target, iPhone only | Next 15 App Router, React Query for core views, Server Actions for writes, Serwist PWA |
| Navigation | Tabs: Home · Spending · Shared · Assistant · Account; stacks per tab; modals for entry | Top bar (Dashboard · Groups · Activity · Account) + mobile bottom bar with a centre Add button |
| Who it's for | Personal spending **and** groups; works without an account | Groups only; every app route needs sign-in. Hosts the public pages (`/g`, `/p`, `/f`, `/join`, `/claim`) |
| Data | Personal ledger + budget on the device (synced when signed in); groups via Supabase RLS; offline outbox | Groups via Supabase RLS; IndexedDB-persisted query cache; offline outbox |
| AI | Talli Assistant (rules first, Apple Intelligence for the rest), receipt reading, describe-it entry, smart split, insight summary — all on-device | Receipt text reading (Tesseract on the Talli server, image not stored), keyword entry; no language model, no cloud AI |

The two apps already share the important rules through `packages/shared`:
split maths and remainders (`utils/split*.ts`), debt simplification
(`utils/debts.ts`), multi-currency ledgers (`utils/currency-ledger.ts`,
`currency.ts`), receipt reconciliation, CSV export, the offline-outbox
contract (`offline/`), Zod schemas, the budget engine (`budget/`) and the
Assistant resolver (`assistant/`). Both call the same RLS-guarded tables and
`SECURITY DEFINER` RPCs, so balances are computed once, in Postgres
(`get_member_balances_v2`) and simplified by the same function on both sides.

## 2. Parity matrix

Status: Complete · Partial · Missing · Broken · Planned · Platform-specific.
Class: **Both** = must have on both · **Web+** = recommended for web ·
**Mobile** = mobile only · **Web** = web only · **Shared** = shared logic required.
"Fixed" = closed in this pass (§3).

### A. Personal expenses

| Feature | Mobile | Web | Gap | Recommendation | Class | Pri | Evidence |
|---|---|---|---|---|---|---|---|
| Personal expense add/edit/delete (+undo) | Complete, guests too | Missing | No personal ledger on web | Port (§4 C1) | Both | P1 | `apps/mobile/src/context/PersonalLedgerContext.tsx`; table `settleup.personal_expenses` unused by web |
| Categories | Partial (fixed list, auto-suggested) | Missing (personal) | — | Comes with C1 | Shared | P1 | `packages/shared/src/utils/category.ts` |
| History / search | Partial (month sections, text search) | Missing | — | With C1; add category/date filters on both | Both | P2 | `(tabs)/spending/index.tsx` |
| Recurring personal expenses | Missing | Missing | Only group recurring exists | Defer; budget's fixed costs cover the main need | — | P3 | — |
| Multiple currencies | Complete (per-expense, never summed) | n/a | — | With C1 | Shared | P1 | `CurrencyPicker.tsx` |
| Insights | Partial (month total, top categories, budget) | Missing | — | With C1/C2 | Both | P2 | `MonthSummaryCard.tsx` |
| Receipt scan | Platform-specific (Apple Intelligence) | Group only (OCR) | Web personal entry missing | With C1, reuse web OCR | Web+ | P2 | `useReceiptScan.ts`; `apps/web/src/app/actions/ai.ts` |
| Natural-language entry | Assistant + Describe it | Group "Chat" keyword parser | — | §4 C5 | Web+ | P2 | `packages/ai/src/features/conversation.ts` |
| Personal export (CSV) | Missing | Missing | Data portability | Add on both after C1 | Both | P2 | only `buildGroupLedgerCsv` exists |

### B. Groups and shared expenses

| Feature | Mobile | Web | Gap | Recommendation | Class | Pri | Evidence |
|---|---|---|---|---|---|---|---|
| Create / rename / archive / restore / delete / leave / transfer | Complete | Complete | — | — | Both | — | `services/groups.ts`; `actions/groups.ts` |
| Add members by name (no account needed) | Complete | Complete | — | — | Both | — | `actions/members.ts` |
| Claim links for people not on Talli | Complete | Complete | — | — | Both | — | `create_member_claim_invitation`; `/claim` |
| Join by code / link (with same-name check) | Complete | Complete | — | — | Both | — | `preview_group_invite` |
| Roles (owner/admin/member) | Complete | Complete | — | — | Both | — | `promote_member`, `transfer_group_ownership` |
| **Friend ledgers (1:1)** | Complete (list, invite, remove) | **Was Broken → Fixed**: shown as a normal group with add-member/invite/leave/delete controls the database refuses | Web can accept an invite but not list/create friends | Fixed the controls (§3); port Friends list + invite (§4 C3) | Both | P1 | `groups.kind`; `apps/web/src/components/groups/GroupSettingsClient.tsx` |
| Split methods (equal, %, shares, exact, itemized, multi-payer) | Complete | Complete | — | — | Shared | — | `SplitEditor.tsx`; `AddExpenseForm.tsx`; `utils/split*.ts` |
| Smart split (AI) | Platform-specific | Hidden (`showSmart={false}`, `getSmartSplit` unused) | Dead code on web | Remove `getSmartSplit` or keep hidden | — | P3 | `actions/ai.ts` |
| Edit / delete expense, comments, activity | Complete | Complete | — | — | Both | — | outbox kinds on both |
| Balances and simplified debts | Complete | Complete | — | — | Shared | — | `get_member_balances_v2` + `simplifyDebts` |
| Settle up / record / confirm / reject / undo payments | Complete | Complete | — | — | Both | — | `record_payment_v2`; `SettleUpButton.tsx` |
| Payment details (GCash, bank, QR) | Complete | Complete | — | — | Both | — | `account/payment` on both |
| Organizer-entered payment details for people not on Talli | Complete | Missing | — | Port (§4 C4) | Web+ | P2 | `member-payment.tsx`; RPC `upsert_member_payment_details` |
| **Group shared link on/off, new link** | Complete | **Was Missing → Fixed** (web also kept offering a dead link after it was turned off on iPhone) | — | — | Both | — | `SharedLinkSection.tsx` (both apps) |
| **Hide my payment details in one group** | Complete | **Was Missing → Fixed** | — | — | Both | — | RPC `set_hide_payment_details` |
| Public pages `/g`, `/p`, `/f` | Creates links (opens web) | Hosts them | — | Keep on web | Web | — | `apps/web/src/app/{g,p,f}` |
| Recurring group expenses | Complete | Complete | — | — | Both | — | pg_cron materialiser |
| Group budget | Complete (not on friend ledgers) | Complete (now also hidden on friend ledgers) | — | — | Both | — | `BudgetSection.tsx` |
| Group CSV export / print summary | Complete | Complete (print hidden when link is off) | — | — | Shared | — | `buildGroupLedgerCsv` |
| Group insights | Charts + AI summary (device) | Charts (numbers only) | AI summary is device-only | Keep | Platform | P3 | `insights.tsx`; `InsightsPageClient.tsx` |
| Realtime refresh | Complete | Complete | — | — | Both | — | `useGroupRealtime.ts`; `GroupRealtimeRefresher.tsx` |
| Push notifications | Complete (opt-in) | Missing | No web push | Defer (§4 C8) | Web+ | P3 | `supabase/functions/send-push` |
| Search within a group | Missing | Partial (item name, loaded pages) | — | Server-side search on both | Both | P2 | `ExpenseList.tsx` |

### C. Account and guest

| Feature | Mobile | Web | Gap | Recommendation | Class | Pri | Evidence |
|---|---|---|---|---|---|---|---|
| Use without an account | Complete (personal + budget + Assistant) | Missing (public pages only) | Web always asks to sign in | §4 C6 | Web+ | P2 | `isGuestAllowed()`; web `middleware.ts` |
| Guest → account import | Complete | n/a | — | With C6 | Shared | P2 | `GuestImportPrompt.tsx` |
| Sign-in methods | Email, Google, Apple (flagged) | Email, Google | **People who joined with Sign in with Apple have no web sign-in** (only a password reset) | §4 C2 | Both | P1 | `apple-auth.ts`; `GoogleSignInButton.tsx` |
| Onboarding + main currency | Complete | Missing (per-group default currency only) | — | With C1/C6 | Both | P2 | `onboarding.tsx`; `PreferencesContext.tsx` |
| **Edit display name** | Complete | **Was Missing (action existed, no UI) → Fixed** | — | — | Both | — | `ProfileNameForm.tsx` |
| Cross-device sync | Personal ledger + budget | n/a | — | With C1/C2 | Shared | P1 | `services/personal.ts`, `services/budget.ts` |
| **Close account** | Complete via `apps/api` | Complete | **Was Broken on iPhone → Fixed**: closing from the iPhone left the user's public payment-QR images in storage; web removed them | — | Both | — | `apps/api/src/routes/account.ts` |
| Personal data export | Missing | Missing | — | With personal CSV | Both | P2 | — |
| Offline changes | Outbox (13 kinds) | Outbox (13 kinds) + PWA | — | Share the executor (§7) | Shared | P2 | `lib/outbox/executor.ts` ×2 |

### D. Budgeting (branch `feature/adaptive-budgeting`)

| Feature | Mobile | Web | Recommendation | Pri |
|---|---|---|---|---|
| Daily / weekly / monthly figures, monthly ceiling, adaptive weekly rollover (full or smoothed), overspend recovery, month boundaries, set-asides, history | Complete (engine `packages/shared/src/budget`, 107 tests; screens under `(tabs)/spending/budget*`) | Missing | §4 C1 — the engine is already platform-neutral; web needs screens, the personal ledger and the same `personal_budgets` sync | P1 |
| AI budget help | Assistant (rules) | Missing | With C5 | P2 |
| Sync of budgets | CAS RPC `save_personal_budget` — **migration applied locally only** | — | Owner applies `20261012100000_personal_budgets` live | Owner |

Planned-only items: none of the brief's budgeting features is "planned but
missing"; the remaining limitations are listed in `docs/budgeting/VALIDATION.md`.

### E. AI

| Capability | Mobile | Web | Why |
|---|---|---|---|
| Talli Assistant (chat that proposes changes, Confirm before any write) | Hybrid: rules first, Apple Intelligence for the rest | Missing | The resolver/validator is pure TypeScript in `packages/shared/src/assistant`; only interpretation of unusual phrasing needs the on-device model |
| Receipt reading | Apple Intelligence + Vision (device) | Tesseract OCR + reconcile (server, image discarded) | Apple frameworks don't exist in browsers; the deterministic reconcile is shared |
| Describe-it entry, smart split, insight narrative | Apple Intelligence | Keyword parser / none | Same |
| Cloud AI | None | None | Project rule: no cloud provider or fallback (`CLAUDE.md`) |

**What makes sense on web:** a rules-only Assistant (the same
`interpretWithRules` + `resolveCommand` + Confirm), which handles the common
phrasings measured in `docs/ai/AI_BENCHMARK_RESULTS.md` without any model.
Browser on-device models (e.g. Chrome's built-in AI) are not available on all
browsers and are not Apple Intelligence; treat any such use as a separate,
opt-in experiment, never a dependency.

### F. Platform experience

| Area | Mobile | Web | Notes / recommendation | Pri |
|---|---|---|---|---|
| Navigation | Native tabs + stacks | Top bar + bottom bar | Platform-appropriate; web lacks a "Spending" area (comes with C1) | — |
| Responsive layout | iPhone only | Responsive, `max-w-6xl` | OK | — |
| Loading / empty / error | Skeletons, EmptyState, ErrorBanner, error boundary clears caches | Skeletons, `error.tsx`, `not-found.tsx`; **no `global-error.tsx`** | Add `global-error.tsx` | P2 |
| Offline | Outbox, banner, pending sheet | Outbox, banner, PWA offline page | Parity | — |
| Notifications | Push | None | §4 C8 | P3 |
| Accessibility | Labels, Dynamic Type checked to XXL | `aria-*`, roles; no skip link | Add skip link, check focus order in dialogs | P2 |
| Deep links | `talli://` + universal links for `/join`, `/claim`, `/groups/*` | AASA/assetlinks served from env | `/g`,`/p`,`/f` intentionally stay web pages | — |
| Keyboard shortcuts | n/a | None beyond tabs/forms | Optional: `n` new expense, `/` search | P3 |
| Dark mode | Follows system | Light only | Optional | P3 |
| Data consistency | Same RPCs, same `simplifyDebts`, same currency rules | Same | Verified by shared tests and the SQL suites (17/17) | — |

## 3. Fixed in this pass (implemented, tested)

| Fix | Files | Evidence |
|---|---|---|
| Web treats friend ledgers as friend ledgers: no add-member, invite code, claim invites, budget, leave, archive/delete or member removal (the database refuses a third member, and removing one would orphan the friendship); a note explains why; listed under **Friends** on the groups page | `lib/queries/groups.ts`, `GroupSettingsClient.tsx`, `GroupDetailClient.tsx`, `MemberAvatarRow.tsx`, `GroupsClient.tsx`, `GroupList.tsx`, settings `page.tsx`; shared `GroupWithStats.kind` | `friend-ledger.test.tsx`, `groups-list.test.tsx`; **verified** in the browser on the local stack ("Ben & Ana") |
| iPhone: "Remove from Group" no longer offered in a friend ledger (Remove Friend is the supported path) | `apps/mobile/app/(protected)/groups/[id]/settings.tsx` | Codex plan review finding; mobile tests/typecheck |
| Web group **Shared link** section: on/off, make a new link, copy; per-group **Hide my payment details**; group page and print summary stop offering a dead link | `SharedLinkSection.tsx`, `actions/collaboration.ts` (`setGroupLinkEnabled`, `regenerateGroupLink`, `setHideMyPaymentDetails`), `ExportSection.tsx`, `GroupDetailClient.tsx` | `shared-link-section.test.tsx`; **verified**: off → page shows "Shared link is off", copy and print gone; on → new link |
| Web **display name** editing | `components/account/ProfileNameForm.tsx`, account `page.tsx` (existing `updateMyProfile`) | `profile-name-form.test.tsx` |
| Closing an account **from the iPhone** now deletes the user's public payment-QR images, as web already did; on both, the images are removed only **after** `close_account` succeeds, so a failed closure never leaves a live profile pointing at deleted images | `apps/api/src/routes/account.ts`, `apps/web/src/app/actions/account.ts` | **verified** over HTTP on the local stack: QR objects 2 → 0 after closure, `200 {"closed":true}` |
| Landing page no longer promises AI the web doesn't have | `apps/web/src/app/page.tsx` | example phrase covered by `packages/ai` test |

### Reviews

| Review | Findings | Triage |
|---|---|---|
| Codex plan review | 3 high, 5 medium, 1 low | Accepted: group-list RPC lacks `kind` (separate RLS query, not a default); shared link + privacy switch stay on friend ledgers (mobile shows them); hide member removal on friend ledgers (both apps); complete control inventory; create the linked docs; Caddy default host; run SQL suites. Rejected: "old OG URL removed" — `og/settleup-social.png` was never published |
| Codex code review | 1 medium: QR images deleted before `close_account` | Accepted and fixed in the API and web (delete after closure succeeds); re-verified end to end |

The Codex CLI refuses a focus prompt together with `--uncommitted`, so the code
review used its default criteria.

## 4. Recommended web ports, ranked

Scored on user value × frequency, friction removed, importance to Talli's core,
web feasibility, complexity, shared-code reuse, privacy, maintenance.

### P0 — none open
No remaining defect corrupts data or blocks a core group task on either
platform after §3. (The live-database budget migration is an owner action, not
a code gap.)

### C1 · Personal spending and budget on web — **P1**
- **Problem:** half of Talli (personal ledger, adaptive budget) doesn't exist on
  web; a signed-in user sees their groups but not their own spending or what's
  safe to spend.
- **Web experience:** a "Spending" nav item: month list with search, add/edit
  sheet (keyboard-first, Enter to save), budget card (safe today / left this
  week / left this month) and a budget page with the week table as a real
  table; setup with the same preview.
- **Why now:** most frequent personal action; engine, schemas, merge and sync
  contract are already shared and tested.
- **Dependencies:** owner applies `20261012100000_personal_budgets` live;
  `personal_expenses` RPCs exist. Decide signed-in-only first (C6 later).
- **Effort:** L (2–3 weeks). **Risk:** medium (sync conflicts — reuse the
  three-way merge and CAS exactly as mobile does; don't fork it).
- **Acceptance:** an expense added on iPhone appears on web after refresh and
  vice versa; budget figures are identical on both for the same data (shared
  fixture test); offline add on web syncs once; no figure shown while inputs
  load.

### C2 · Sign in with Apple on web — **P1**
- **Problem:** anyone who created their account with Apple on iPhone can't sign
  in on web except by resetting a password (often to a relay address).
- **Web experience:** "Continue with Apple" beside Google on `/login` and
  `/register`.
- **Dependencies (owner):** Apple Services ID + return URL, Supabase Apple
  provider for web. **Effort:** S. **Risk:** low.
- **Acceptance:** an Apple-created account signs in on web and sees the same
  groups.

### C3 · Friends on web — **P1**
- **Problem:** web can accept a friend invite but can't list friends, create an
  invite or remove a friend; friend ledgers now display correctly (§3) but
  can't be managed.
- **Web experience:** Friends section with "Invite a friend" (copy link) and
  "Remove friend"; uses `list_friends`, `create_friend_invite`, `remove_friend`.
- **Effort:** S–M. **Risk:** low (RPCs exist and are SQL-tested).
- **Acceptance:** invite created on web accepted on iPhone; remove on web
  converts the ledger to a normal group on both.

### C4 · Organizer-entered payment details on web — **P2**
Members without accounts can have "how to pay them" details on iPhone
(`upsert_member_payment_details`); web shows none. **Effort:** S. **Risk:** low
(privacy rules are server-side).

### C5 · Rules-only Talli Assistant on web — **P2**
Reuse `interpretWithRules`, `resolveCommand`, revalidation and the Confirm
preview; web executor calls existing Server Actions/outbox. No model.
**Effort:** M. **Risk:** medium (copy must not imply a model; every write still
needs Confirm). **Acceptance:** the rules-only eval sets pass the same through
the web entry point.

### C6 · Web without an account — **P2**
Local-only personal ledger and budget in IndexedDB with the same guest → account
import as mobile. **Effort:** M after C1. **Risk:** medium (storage eviction in
browsers; say so in the UI).

### C7 · Small web hygiene — **P2**
`global-error.tsx`, skip link, personal/data CSV export, server-side expense
search with category/date filters (both platforms), remove dead
`getSmartSplit`. **Effort:** S each.

### C8 · Web push — **P3**
Expo push already covers the main device; web push needs VAPID keys, a second
delivery path and iOS PWA caveats. Defer until users ask.

### Not recommended
Smart split and AI narrative on web (no on-device model; numbers already
shown), Android-specific work (no Android release planned), copying iPhone tab
layout to web.

## 5. Cross-platform UX review

1. **Most important tasks on either platform?** Groups: yes on both. Personal
   spending/budget: iPhone only (C1).
2. **Shared features consistent?** Now yes for groups, friend ledgers, shared
   links and payment privacy (§3). Friend management and organizer-entered
   payment details remain iPhone-only (C3, C4).
3. **Calculations consistent?** Yes: balances come from the same RPC and
   `simplifyDebts`; currencies are never summed on either side.
4. **Terminology:** "Settle up", "Shared link", "Hide my payment details" now
   match; web says "Groups" and iPhone says "Shared" for the same area — keep
   (the iPhone tab also holds Friends), but web's Friends heading now matches.
5. **Navigation:** platform-native (tabs vs top bar) — keep.
6. **Recognisable identity:** same emerald brand, icon, Talli name everywhere.
7. **Extra steps:** web has none extra for groups; iPhone has no web-only steps.
8. **First-time users:** iPhone has onboarding; web lands on a dashboard/empty
   state without an intro or main currency (with C1/C6).
9. **Unnecessary login barriers:** public pages need none; web requires sign-in
   for everything else, unlike iPhone (C6).
10. **Financial data safety:** payment details opt-in with masking (server-side),
    per-group hide now on both, links revocable on both, QR images removed on
    closure from both.

## 6. Architecture and code sharing

Already shared (keep): money/split/debts/currency utils, receipt reconcile, CSV,
Zod schemas, types, offline contract, budget engine, Assistant resolver.

Recommended (Workstream E), in order:
1. **One outbox executor.** `apps/web/src/lib/outbox/executor.ts` and
   `apps/mobile/src/lib/outbox/executor.ts` differ by ~33 lines; move the kind →
   RPC mapping into `packages/shared/src/offline` behind an injected client.
   Parity becomes structural. M, low risk with the existing executor tests.
2. **Shared query/RPC fetchers** for the core views (mobile `services/*`, web
   `lib/queries/*`) in `packages/supabase`, keeping per-app hooks. M.
3. **Group capability rules** (`kind`, role, read-only → which controls) as a
   pure shared function used by both settings screens. S.
4. **Parity tests:** a shared fixture run through both apps' fetch/compute paths
   for balances and budget figures; the brand guard test already runs in CI.
Do not share UI components between React Native and web.

## 7. Roadmap

| Workstream | Milestone | Goal / scope | Acceptance | Validation | Risk | Effort |
|---|---|---|---|---|---|---|
| A Rebrand | A1 (**done**) | Customer-facing Talli everywhere; legacy identifiers documented | Brand guard test passes | `brand.test.ts`, browser check | Low | — |
| | A2 (owner) | `talli://` OAuth callback, auth email templates, store name | Sign-in returns via `talli://`; emails say Talli | Device sign-in | Medium | S |
| B Parity fixes | B1 (**done**) | §3 | Tests + local verification | as §3 | Low | — |
| C Web ports | C2 → C3 → C1 → C4 → C5 → C6 | §4 | per item | unit + local journeys | per item | S…L |
| D UX consistency | D1 | Terminology pass after C1/C3, skip link, `global-error.tsx`, web onboarding (main currency) | Same labels for same actions | review + a11y check | Low | S |
| E Architecture | E1–E4 | §6 | One executor; shared fetchers; capability function; parity fixture | existing suites | Low–medium | M |

## 8. Owner decisions and actions

- Apply `20261012100000_personal_budgets` to the live project (before C1).
- Apple Services ID for web sign-in (C2).
- Supabase auth: add `talli://auth/callback`; confirm email templates say Talli.
- App Store listing name and trademark check.
- Whether web gets a no-account mode (C6) — changes the web's privacy story.
- Push/merge of `feature/adaptive-budgeting` and this branch.
