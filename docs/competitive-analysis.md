# SettleUp vs. Splitwise — Competitive Analysis & Product Audit

**Date:** July 15, 2026
**Branch analyzed:** `dev` (`01ab2be`)
**Scope:** Full codebase audit (web, mobile, shared packages, Supabase backend), competitive research (Splitwise, Tricount, Settle Up, Splid, Kittysplit, Spliit, and newer entrants), gap analysis, market-readiness scoring, and a prioritized roadmap.

> This report is intentionally blunt. Where the product is good, it says so; where it would lose to Splitwise on day one, it says that too.

---

## 1. Executive Summary

**Verdict: SettleUp is not ready to compete with Splitwise head-on today — but it is closer than most clones, and it is pointed at the right wedge.**

The codebase is genuinely good: correct, well-tested money math; a security-first Supabase architecture; a modern UI that already looks better than Splitwise's; and two real differentiators — AI-assisted expense entry (receipt scan, natural-language chat, smart splits) and a no-account share-link model with GCash/bank payment profiles. Both differentiators map precisely onto Splitwise's two open wounds: its December 2023 free-tier caps/ads backlash (1.8/5 on Trustpilot) and its US/EU-only settlement rails.

Five things stop it from competing today:

1. **PHP-only, hardcoded currency** — no travel groups, the category's #1 acquisition moment.
2. **No 1:1 friends ledger** — half of Splitwise usage is pairwise, outside groups.
3. **No offline entry and no expense dates** — trust-breaking gaps in a category where entry happens at restaurants and gets backfilled later.
4. **The differentiators are switched off** — `LLM_ENABLED=false` everywhere, the default vision model doesn't exist, and share links can't deep-link into the mobile app.
5. **The name.** "Settle Up" (settleup.io) is a 13-year-old incumbent in this exact category. Launching under "SettleUp" invites app-store rejection, trademark exposure, and permanent ASO/SEO futility. Rename before launch.

**The strategic opportunity is real and specific:** be the *Splitser of the Philippines*. Global apps (Splitwise, Tricount, Splid) track debts but cannot settle in pesos; GCash's KKB feature settles but cannot track (no groups, no ledger, no simplification). A persistent group ledger with utang-aware reminders and two-tap GCash settlement occupies an empty middle in a market with 94M GCash users — the same country-specific playbook that made Splitser (5M+ users) beat Splitwise in the Netherlands. Monetize Splid/Settle Up-style (one-time or group-funded premium, never daily caps), positioning directly against Splitwise's most hated decision.

**Overall readiness: 5.4/10** (scores in §11). Roughly 8–12 weeks of focused work on the Must-Have list (§10) separates the current build from a credible PH-market launch.

---

## 2. Current Product Overview

### 2.1 What SettleUp is today

SettleUp is a **group expense splitter for the Philippine market**: peso-only, GCash/bank-transfer-oriented, mobile-first, with an unusually strong AI expense-entry story and a "no account needed" sharing model. It ships as:

- **Web** — Next.js 15 App Router PWA (installable, offline-readable), `apps/web`
- **Mobile** — Expo 54 / Expo Router v6 app (iOS/Android), `apps/mobile`
- **API** — small Hono server for mobile AI + account deletion, `apps/api`
- **Backend** — Supabase (Postgres + Auth + Storage + Realtime + Edge Functions), 70 migrations, everything behind RLS

### 2.2 Feature inventory (what actually exists on `dev`)

**Groups & membership**
- Create / rename / archive / restore / delete groups; transfer ownership; leave group
- Roles: owner / admin / member (`promote_member` RPC)
- Members are **display names first, accounts second** — a member row exists without a user and can be *claimed* later via a per-member share token. This is the core onboarding innovation.
- Invite code (`/join`), per-group public link (`/g/<shareToken>`), per-member public link (`/p/<share_token>`)
- Group budget with progress bar; per-group custom categories (9 defaults + custom icon/color)

**Expenses**
- Five entry modes: Quick (equal split), Detailed (multi-payer, custom exact splits, recurring), Itemized (line items with per-item participants), AI receipt scan, AI natural-language chat
- **Multi-payer** support with payer-sum validation (`packages/shared/src/schemas/index.ts`)
- Split modes: equal (largest-remainder rounding, `packages/shared/src/utils/split.ts`), custom exact cents, itemized, AI "smart split" from a free-text hint ("60/40", "Ana had 2 drinks")
- Recurring expenses (weekly/monthly), materialized server-side by pg_cron
- Expense comments; edit/delete with permission checks (creator or admin/owner); batch add
- Categories with icons; notes

**Balances & settling**
- Net balance formula in SQL (`paid − shares − received + sent`), consistent across 5 RPCs
- **Debt simplification** — greedy min-transfer algorithm (`packages/shared/src/utils/debts.ts`), plus un-netted pairwise view
- Settle-up dialog pre-filled with suggested amount; undo last payment
- **Friend payment workflow**: a non-registered member opens their public link, taps "I've paid," and the creditor confirms/rejects (PENDING → PAID/REJECTED). Pending payments correctly excluded from balances.
- Creditor payment profiles: GCash / bank details with QR image, account numbers masked to last-4 in public payloads

**AI (`packages/ai`, OpenAI-backed, `LLM_ENABLED` gated)**
- Receipt OCR: vision LLM → Tesseract + text LLM → regex fallback chain; HEIC conversion; PH-receipt-tuned prompts (VAT, SC/PWD discounts)
- Natural-language expense entry (chat → draft), smart split, spending insights narrative
- On-device OCR on mobile (Apple Vision / ML Kit via `expo-text-extractor`)
- Disciplined: AI only ever produces drafts, user confirms, Zod-validated output, per-user rate limits

**Platform**
- Activity feed (dashboard + full page + per-group timeline)
- Realtime updates (Supabase postgres_changes → debounced refresh) on both platforms
- Mobile push notifications (Expo tokens, pg_net trigger → edge function); haptics
- CSV export; per-group insights dashboard (deterministic + optional AI summary)
- Admin panel + waitlist; Sentry on web and mobile; CI (lint/typecheck/test/build)

### 2.3 What the implementation says the product wants to be

The code reveals a clear thesis: **remove the two biggest frictions in expense splitting — data entry and getting paid.** AI handles entry (receipt scan, chat, smart split); GCash QR + public links + self-reported payments handle settlement in a market where money moves over GCash, not Venmo. The "members without accounts" model targets the reality that only one person in a barkada will ever install the app.

That thesis is genuinely differentiated. The problem, detailed below, is that the table-stakes layer underneath it (currencies, dates, offline, search, notifications-that-navigate) is not finished, and the differentiators are switched off (`LLM_ENABLED=false`, `BILLING=false`).

### 2.4 Unfinished / placeholder functionality

| Item | Evidence |
|---|---|
| All AI features disabled by default | `FEATURE_FLAGS.LLM_ENABLED=false`, runtime `LLM_ENABLED` env; CI runs with it off |
| Default vision model is a phantom (`gpt-5.4-mini`) — receipt vision 404s unless env overrides it | `packages/ai/src/core/openai.ts:16` |
| Billing/monetization completely absent | `FEATURE_FLAGS.BILLING=false`; no pricing surface anywhere |
| Push notifications half-wired: DB trigger is a no-op until `app_config` is seeded; taps don't navigate | `supabase/migrations/20260612020000_push_notifications.sql`; no `addNotificationResponseReceivedListener` in `apps/mobile` |
| Mobile deep links absent: `settleup://` scheme declared, zero handlers; share links open the web app | `apps/mobile/app.json`, no `Linking` usage in `apps/mobile/app` |
| Dashboard sparkline is a hardcoded decorative SVG, not real data | `apps/web/src/app/(protected)/dashboard/page.tsx` |
| `packages/ui` is an empty package still described in docs | `packages/ui/`, `CLAUDE.md` |
| Credits (negative expenses) not editable on mobile ("…not editable from this screen yet") | `apps/mobile/app/(protected)/groups/[id]/index.tsx` |
| README/docs drift: README lists OCR and unequal splits as "future" though shipped; brain docs point to an AI layer location that moved | `README.md`, `docs/brain/01-architecture.md` vs `packages/ai` |

---

## 3. Competitive Analysis

### 3.1 Splitwise (the incumbent)

**Scale & moat.** ~2011-vintage, 170+ countries, tens of millions of users, estimated ~60% share of the dedicated splitting market. The moat is (a) the network — "your friends already have it" — and (b) the running-balance model: persistent **friends (1:1) ledgers plus groups**, with the signature **Simplify Debts** graph reduction. Since 2023 it has pivoted into payments: Venmo/PayPal deep links, **Splitwise Pay** wallet + auto-splitting **Mastercard debit card** (US, via Coastal Community Bank), and **Tink pay-by-bank** (UK, and France/Germany/Austria since Oct 2025).

**Free tier:** groups + friends ledgers, all split types (equal / exact / **percentage** / **shares** / **adjustment** / itemized), 100+ currencies (balances kept per-currency; conversion is Pro), simplify debts, comments, categories, recurring expenses, whiteboard, CSV export, Zapier.

**Pro (~$4.99/mo or ~$40/yr; regional variants):** no ads, **no daily expense limits**, receipt scanning + itemization, FX conversion, charts, search, default splits, JSON backups.

**The open wound.** In **December 2023** Splitwise capped free users at ~3–4 expenses/day with a ~10-second ad-wait before each save, and moved previously free features (receipt photos, FX conversion, charts, search) behind Pro. The result: 1.8/5 Trustpilot (~65% one-star), a visible defector ecosystem, and an open-source clone movement (Spliit, split-pro). Top complaints, ranked: daily cap; pre-save ads; paywalled ex-free features; Pro price for a utility; un-disableable Pro upsell notifications; post-update sync/performance issues; slow Splitwise Pay transfers; rigid itemization (items can only be split 0/50/100% per person).

**Most-requested features Splitwise hasn't shipped:** partial payments, bulk edit, per-bill paid status (explicitly declined), richer per-person exports, arbitrary per-item percentages, guest/no-account participation.

**What this means for SettleUp:** the cheapest durable positioning in 2026 is *"unlimited free logging, free receipt scanning, no ads before saving"* — a direct inversion of Splitwise's monetization. SettleUp's architecture already supports this (no caps anywhere); it just needs to say it out loud and never betray it.

### 3.2 Competitor matrix

| | Model | Multi-currency | Offline | No-account join | Receipt OCR | Payments | Standout | Achilles' heel |
|---|---|---|---|---|---|---|---|---|
| **Splitwise** | Freemium, ~$40/yr | 100+ (FX = Pro) | Yes | Invite links (account needed to participate) | Pro only | Venmo/Tink/own card | Network + friends ledger | Daily caps + ads backlash |
| **Tricount** (bunq) | 100% free (bank funnel) | Yes | Yes | View/add via link | No | bunq card auto-capture | Free & simple; auto-capture | 2024–25 rewrite: sync failures, balance bugs, bunq pushiness |
| **Settle Up** (Step Up Labs) | Freemium ~$40/yr **+ group-funded one-time premium** | Yes | Yes | No | Premium photos (no itemization) | No | Cross-platform incl. watch; 35%-converting contextual trial paywall | Calc-error complaints; aggressive ads |
| **Splid** | Free + **$4.99 one-time** | 150+ w/ conversion | **Offline-first** | Yes (code/link) | No | No | Travel gold standard; anti-subscription pricing | No realtime sync; occasional balance bugs |
| **Kittysplit** | Free; ~€3/kitty one-time | Super Kitty only | No | **Total** (web link, zero accounts) | No | No | Lowest onboarding friction anywhere | Link=security; shallow; per-event only |
| **Spliit** (OSS) | Free, MIT, donations | Yes | No | Yes (URL) | **Yes, free** | No | Open-source trust post-Splitwise-betrayal | PWA only; hobby cadence |
| **Tab** | Free | — | No | Join by code | **Yes — "claim your items"** | Venmo | The restaurant-bill delight flow | No persistent ledger |
| **Cino** (€3.5M seed, 2025) | Free | EU cards | — | — | n/a | **Splits at the moment of payment** (shared virtual card) | Kills the ledger concept entirely | EU rails only; group must pre-link cards |
| **Splitser/WieBetaaltWat** | Freemium | Yes | Yes | Link | No | iDEAL/Tikkie rails | **Proof that country-specific + local rails beats global at home** (5M+ users, NL App of the Year 4×) | NL-only by design |
| **GCash KKB** (PH) | Free (in super-app) | PHP | No | Everyone's already on GCash | Per-item amounts manual | **Native settlement** | The rail itself | *Request tool, not a ledger*: no groups, no balances, no simplification, scam-request problem |

Also notable: **Apple's iOS 27 Apple Cash receipt-splitting** (announced June 2026) commoditizes receipt itemization UX in the US — little direct PH impact, but it confirms "scan → claim items" as the category's delight bar. A swarm of indie "Splitwise alternative" apps (SplitMyExpenses, Split Circle, SplitterUp, Settlify…) compete on unlimited-free + AI scanning; none has breakout scale.

### 3.3 What users love and hate across the category

**Loved:** no-account link join ("only one person needs the app"); offline-first sync; one-time or group-funded pricing; genuinely unlimited free tiers; receipt scan with claim-your-items; debt simplification (now expected everywhere); auto-capture from cards.

**Hated:** daily caps and retroactive paywalls; **balance calculation bugs** (reported against Tricount, Splid, *and* Settle Up — accuracy is the trust core of the category); sync failures; ads inside a money app; forced ecosystem sign-ups (Tricount→bunq resentment); abandonment (Plates).

**Underserved gaps nobody owns:** offline-first *and* realtime together; settlement in local rails outside US/EU; recurring roommate/household workflows; voice/chat AI entry done well; the social choreography of debt collection ("utang" reminders that preserve friendships).

### 3.4 Philippines market context

- GCash: **94M registered users**, ~80–94% adult penetration, 6M+ merchants. "KKB" (kanya-kanyang bayad) is a cultural institution.
- GCash KKB splits a single bill as payment requests but keeps **no ledger** — no persistent groups, no running balances, no multi-payer, no simplification; complex splits require "math outside the app." BDO Pay has a similar basic request feature. Local indie **Caban** (2025) is a budget tracker with utang reminders, not a group ledger.
- PH media currently recommend *global* apps (Splitwise/Splid/Tricount) for barkada trips — none settles in pesos.
- **Caveats to the GCash thesis:** no public consumer P2P API (integration = deep links / QR Ph, not true API settlement); platform risk that GCash extends KKB into a ledger; and PH price sensitivity favors one-time/group-funded premium over subscriptions.

**Conclusion:** the Splitser playbook — country-specific ledger + local-rail settlement — is open in the Philippines, and SettleUp's existing GCash payment profiles, QR support, and no-account links are exactly the right foundation for it.

---

## 4. UX Audit

Grading each flow as a first-time consumer would experience it. ✅ good · ⚠️ friction · ❌ broken/missing.

### 4.1 Onboarding & auth

- ✅ Email+password and Google OAuth; clean "check your email" state; middleware redirects are correct.
- ⚠️ **Email confirmation before first value.** A new user hits a dead stop at the inbox before ever seeing a group. Splitwise and Tricount let you reach value faster. Consider magic links or deferring confirmation until after first group.
- ⚠️ No product tour or first-run guidance; the group setup checklist (`GroupSetupChecklist`) partially compensates — it's a genuinely good pattern.
- ❌ **The waitlist wall.** The landing page funnels to `/waitlist`; combined with `BILLING=false` this reads as pre-launch posture, not a competing product.

### 4.2 Creating a group & inviting

- ✅ Group creation is ~2 taps + a name. Owner auto-added. Best-in-class.
- ✅ The share-link model (`/g/<token>`, `/p/<token>`) is the app's UX crown jewel: friends see balances and payment QR **without installing anything or signing up**. Splitwise cannot do this.
- ⚠️ Invite = copy a link or read out a code. There's no contact picker, no QR-to-join in person, no SMS/WhatsApp/Viber share sheet integration on web.
- ❌ On mobile, tapping a shared link opens the **web** app; there is no deep link into the native app, and joining natively is manual code entry (`apps/mobile/app/(protected)/groups/join.tsx`). For a mobile-first market this is a serious leak in the growth loop.

### 4.3 Adding expenses

- ✅ Quick add is excellent: description, amount, payer defaults to *you*, participants default to *everyone*, live per-member preview, ~4 interactions total. Matches or beats Splitwise's add flow.
- ✅ Itemized entry with per-item participants is a feature Splitwise charges Pro for (receipt itemization) and most free rivals lack.
- ✅ AI modes (scan, chat) are the standout — *when enabled*.
- ❌ **No expense date.** `settleup.expenses` has only `created_at`; you cannot backfill Saturday's dinner on Monday with the right date. Every competitor has this. It corrupts insights, exports, and trust in the ledger. This is the single most jarring core-model gap.
- ❌ **No percentage or shares split modes.** Equal/exact/itemized only (`split_mode: "equal" | "custom"`). Rent split 60/40 by income, or 2 adults + 1 child weighting, requires manual cent math (or the AI smart-split — which is off).
- ⚠️ No per-expense currency (see §7); no attachments on ordinary expenses (receipt images only flow through the AI scan path).

### 4.4 Editing & deleting

- ✅ Permission model is sensible (creator or admin/owner). Mobile's proportional re-scaling on amount edit (`scalePositiveAmounts`) is thoughtful and correctly rounded.
- ⚠️ No edit history / audit trail visible to users. Splitwise shows "edited by X" — important for trust in shared money.
- ⚠️ Delete is permanent with a confirm dialog; no undo, no tombstone in the activity feed of *what* was deleted beyond the event.

### 4.5 Settling debts

- ✅ Simplified-transfers view ("settle with N payments"), suggested amounts, creditor payment card with GCash QR — genuinely better fit for PH than Splitwise's Venmo-centric flow.
- ✅ "I've paid" self-report → creditor confirm is a smart trust workflow for cash/GCash transfers that happen outside the app.
- ⚠️ "Remind" copies a message to the clipboard — a labeled *nudge* that the user must then paste somewhere. No push/SMS/share-sheet reminder, no scheduled auto-reminders.
- ⚠️ Partial settlements work (amount is editable) but there's no "record a payment for less/more and keep remainder" guidance; no payment date either (same `created_at` issue).

### 4.6 Balances & mental model

- ✅ Balance math is correct, consistent, and tested. Dashboard "you owe / you're owed" split cards are clear.
- ⚠️ Two debt views (pairwise vs simplified) is the right idea but needs careful labeling — users routinely misread simplified debts as "I never owed *that* person."
- ❌ No **cross-group / 1:1 friends ledger**. Everything is group-scoped. The #1 Splitwise habit — "I owe Alice ₱350 overall" across contexts — has no home here. Ad-hoc non-group expenses force creating a throwaway group.

### 4.7 Currencies

- ❌ **PHP only, hardcoded** (`₱`, `en-PH` in `packages/shared/src/utils/money.ts`; no currency column anywhere in the schema). No multi-currency groups, no FX conversion. This caps the product at single-market usage and kills the highest-value use case in the category: travel. Even for a deliberate PH-first strategy, Filipinos travel regionally; a Boracay group works, a Tokyo trip doesn't.

### 4.8 Recurring expenses

- ✅ Exists (weekly/monthly, multi-payer aware, pg_cron materialization) — ahead of several free competitors.
- ⚠️ No monthly-on-date edge handling surfaced in UI (e.g., 31st), no end date, no "pause until", no upcoming-expense preview in the group ledger.

### 4.9 Notifications & awareness

- ⚠️ Realtime refresh while the app is open is great. But awareness *when closed* is weak: mobile push exists yet taps don't route anywhere; web has **no push at all** and no notification center — the bell icon just links to `/activity`.
- ❌ No reminders ("you owe ₱1,200 in Boracay Trip for 2 weeks"), no weekly digests. In this category, the app that *reminds* is the app that gets paid back — it's the retention loop.

### 4.10 Cross-cutting friction inventory

| Friction | Impact |
|---|---|
| No global search (groups, expenses, people) | Grows painful past ~3 active groups |
| No expense list pagination (`listExpenses` fetches everything) | Slow groups after a few hundred expenses |
| Web-only admin/waitlist/legal; mobile lacks archived groups view | Minor parity gaps |
| No CSV import / Splitwise import | Blocks the most valuable acquisition path: defectors with history |
| No localization (UI is English-only; PH users largely fine, but no Tagalog/Taglish option despite PH-first positioning) | Brand opportunity missed |

**Empty/loading/error states:** genuinely good — per-route skeletons, `EmptyState` components, `sonner` toasts, error boundaries, "all settled" celebration banner. Above the bar for an early product.

---

## 5. UI / Design Audit

### 5.1 What works

- Coherent in-house component kit (`apps/web/src/components/ui/`): Button/Input/Dialog/Tabs/Badge/Avatar/Skeleton/EmptyState with consistent `brand-*` token usage — retheming is one CSS block away (`globals.css` `@theme`).
- Mobile-first discipline: bottom tab bar with raised center FAB (both platforms), safe-area utilities, `max-w-6xl` desktop layout, backdrop blur. The dev redesign (dashboard hero, overview cards, member avatar rows, category icons) reads modern — closer to Tricount's contemporary feel than Splitwise's dated UI.
- Micro-animation layer (`fadeIn`, `scaleIn`, active-scale FAB) and haptics on mobile give it consumer-app texture.
- Typography (Inter), spacing, and card language are consistent across screens.

### 5.2 What doesn't

- ❌ **No dark mode** — zero `dark:` variants on web, single light theme on mobile. In 2026 this is a baseline consumer expectation and a top-3 App Store review complaint category for apps that lack it.
- ⚠️ Accessibility is "decent defaults, no rigor": focus rings and `aria-label`s on icon buttons exist, but there's no skip link, form errors aren't consistently `aria-describedby`-linked, color contrast of muted text on tinted cards is unverified, and no reduced-motion handling.
- ⚠️ The decorative fake sparkline on the dashboard undermines trust the moment a user realizes it never changes. Charts should be real data or absent.
- ⚠️ Charts tab exists but is thin; category donut/spend-over-time are table stakes for "insights" claims.
- ⚠️ Landing page is generic SaaS-template styling; it doesn't sell the two real differentiators (AI entry, no-account links) with demos.

### 5.3 Verdict

The UI is **modern enough to compete** — it's cleaner than Splitwise's aging interface and roughly at Tricount's level after the dev redesign. Dark mode and real charts are the two visible gaps between "nice" and "premium."

---

## 6. Technical Audit

### 6.1 Strengths (this is a well-built codebase)

- **Security architecture is the best part of the product.** RLS on every table, recursion-safe `SECURITY DEFINER` helpers, private RPCs revoked from `anon`/`PUBLIC`, masked public payloads, service-role key confined to the one approved route (`apps/api/src/routes/account.ts` self-deletion), validated uploads (MIME+size, server-controlled keys), IP rate limits on public share endpoints, prompt-injection instructions in AI prompts. A prior internal audit (`docs/audit-report.md`, Mar 2026) exists and most of its findings were actually fixed — that's rare and commendable.
- **Money math is correct and tested.** Integer cents everywhere, largest-remainder rounding in `equalSplit`/`computePairwiseDebts`/`scalePositiveAmounts`, payer/split/line-item sums triple-enforced (Zod `superRefine` + DB triggers), pending payments excluded from balances. `packages/shared` has the repo's densest test coverage (debts, splits, money, schemas, parsers).
- Clean conventions: `ApiResponse<T>` discipline (no thrown errors reaching clients), no `any`, no TODO debt, strict TS with `noUncheckedIndexedAccess`, Server Components by default, lean client bundle, Sentry both platforms, CI gate.
- Sensible PWA: NetworkOnly for auth/data, CacheFirst for storage images, offline fallback page, install prompts.

### 6.2 Defects & risks

| Sev | Finding | Evidence | Why it matters |
|---|---|---|---|
| 🔴 | Default vision model `gpt-5.4-mini` doesn't exist; receipt vision 404s unless `OPENAI_VISION_MODEL` is set | `packages/ai/src/core/openai.ts:16` | Your flagship differentiator silently degrades to Tesseract/regex in any env missing one var |
| 🔴 | AI outputs not validated against business invariants: smart-split shares and receipt line items are never checked to sum to the total; AI schemas aren't `.strict()` | `packages/shared/src/schemas/ai.ts` | A hallucinated split accepted by a hurried user writes bad money data |
| 🔴 | Public share payloads mask account numbers but return **unmasked QR image URLs** — the QR encodes the full account number | `supabase/migrations/20260403000006_mask_public_rpc_data.sql:67-73` | Anyone with a leaked group link can harvest full GCash/bank numbers; undermines the masking promise |
| 🟠 | `addExpensesBatch` loops `create_expense` non-transactionally; mid-batch failure leaves partial inserts | `apps/web/src/app/actions/expenses.ts` | Receipt-scan multi-item confirms are exactly this path |
| 🟠 | AI surface implemented **three times** (web Server Actions, web REST routes for mobile, Hono `apps/api`) with duplicated prompts/auth/rate-limiting | `apps/web/src/app/actions/ai.ts`, `apps/web/src/app/api/ai/*`, `apps/api/src/*` | Triple maintenance; fixes (like the phantom model) must land in 3 places |
| 🟠 | Zero tests for RLS policies, RPCs, Server Actions, API routes; no component/E2E tests | test inventory | The security model everyone depends on is verified by hand only |
| 🟠 | No cross-group FK integrity (a member of group A can be attached to an expense in group B at the DB level) | `docs/audit-report.md` §data-integrity, unaddressed by later migrations | Latent corruption class; cheap to fix with composite FKs/triggers |
| 🟡 | Rate limiters (AI fallback, public endpoints) are in-memory, per-instance, fail-open | `apps/web/src/lib/ai/rate-limit.ts`, `lib/public-rate-limit.ts` | Fine at current scale; meaningless behind a load balancer |
| 🟡 | `listExpenses` unpaginated; client-side filtering over the full array | `apps/web/src/app/actions/expenses.ts` | Perf cliff for old/active groups |
| 🟡 | Doc drift (empty `packages/ui`, AI layer location, stale README/schema docs) | various | Onboarding cost, audit confusion |

### 6.3 Offline & sync — the honest version

- Web "offline-capable PWA" = **read-only**: previously visited pages render; no queued writes, no background sync, no optimistic UI.
- Mobile has **no offline story at all**: in-memory react-query cache (lost on restart), no persistence, no NetInfo, no mutation queue (`apps/mobile/src/lib/queryClient.ts`).
- No conflict handling anywhere (acceptable — server-authoritative + realtime is a fine choice — but only once reads survive a dead spot).

Splitwise, Tricount, Settle Up, and Splid all handle offline entry. Splitting happens at restaurants, on islands, on planes — offline *entry* (not full sync) is table stakes for this category.

### 6.4 Scalability read

Supabase + RLS + RPCs will comfortably carry this to hundreds of thousands of users; the dashboard N+1 → single `get_dashboard_summary` RPC fix on dev shows the right instincts. The real scaling debts are the unpaginated lists, in-memory rate limits, `router.refresh()`-per-realtime-event coarseness, and the untested SQL surface — all addressable, none architectural.

---

## 7. Missing Features (gap analysis vs. Splitwise)

### 7.1 Missing critical features

| Gap | Why it matters | User impact | Competitive impact | Suggested solution |
|---|---|---|---|---|
| **Multi-currency + FX** | Travel is the category's #1 acquisition moment; Splitwise supports 100+ currencies | Any trip abroad → instant churn to Splitwise | Disqualifying for the segment most likely to pay | Add `currency_code` to groups + expenses, minor-unit-aware money utils (JPY has no cents), daily FX snapshot table, convert at display with rate shown; group home currency for balances |
| **Expense date** | Ledger correctness and trust | Can't backfill; insights/exports wrong | Every competitor has it | `expense_date date` column defaulting to today, editable; sort/insights/export by it |
| **Percentage / shares splits** | Rent, couples with income splits, families | Manual cent math or nothing | Splitwise free-tier feature | Extend `split_mode` enum + converters to exact cents at save time (keeps DB model unchanged) |
| **1:1 / non-group expenses ("friends" ledger)** | The most common Splitwise habit; half of usage is pairwise | Forced to create fake groups | Core Splitwise moat | Auto-managed hidden two-person groups presented as a "Friends" tab; cross-group per-person rollup on dashboard |
| **Offline expense entry** | Restaurants/travel = dead zones | Lost entries, lost trust | All major rivals handle it | Persist react-query cache (AsyncStorage persister) + simple outbound mutation queue with server-authoritative replay; web: IndexedDB draft queue |
| **Reminders & actionable notifications** | Getting paid back is the product's job | Debts rot; groups go stale | Splitwise's retention engine | Debt-age reminders (push/email), weekly group digest, notification tap → deep link |
| **Mobile deep links + universal links** | Growth loop leaks at its strongest point (share links) | Link opens web, native app orphaned | Rivals route links natively | Expo universal links for `/g/*`, `/p/*`, `/join`; notification routing |

### 7.2 Missing quality-of-life features

- Global search (expenses, groups, members)
- Expense attachments (photo on any expense, not just AI scan path)
- Edit history / "last edited by" on expenses
- CSV/Splitwise **import** (acquisition weapon aimed at frustrated Splitwise users)
- PDF/spreadsheet export beyond CSV; per-member statements
- Recurring: end dates, pause, upcoming preview
- Default split preferences per group (e.g., always 60/40)
- Archived groups on mobile; localization (Tagalog); currency-formatted number keyboard everywhere

### 7.3 Trust & reliability concerns

- QR unmasking issue (§6.2) — a *privacy* promise the product visibly breaks
- No edit trail → "who changed this expense?" disputes have no answer
- Name collision: **"SettleUp" is an established competitor** (Settle Up, settleup.io, Step Up Labs). Shipping under this name invites trademark conflict and App Store confusion. Renaming before launch is strongly advised.
- No RLS/RPC test suite → every schema change risks silently widening data access

---

## 8. Feature Recommendations (innovation beyond parity)

Research-validated context for each bet: receipt "claim your items" is the category's highest-delight flow of 2024–26 (Tab, Spliit, Apple iOS 27); nobody ships voice/chat entry well; nobody settles in SEA rails; and Settle Up publicly documented a ~35%-converting contextual-trial paywall — the monetization pattern to copy if/when premium arrives.

1. **Make AI entry the identity, not a bonus.** Turn `LLM_ENABLED` on, fix the model default, and put "scan → itemized draft → members claim their items" at the center of onboarding. Nobody in the free tier of this market does receipt itemization well; Splitwise locks scanning behind Pro.
2. **"Claim your items" social flow.** After a receipt scan, share a link where each friend taps the line items they ordered (no account needed — the share-token infrastructure already exists). This converts the app's two differentiators (AI + no-account links) into one viral moment at the table.
3. **GCash-native settlement.** Deep-link `gcash://` payment intents / InstaPay QR (QR Ph standard) from the settle screen with amount pre-filled. "Settle in 2 taps" in the PH is a moat none of the global apps will build.
4. **Debt-aging nudges with personality.** Automated, escalating, Taglish-optional reminders the creditor approves — solves the social awkwardness that is the *actual* pain of owed money.
5. **Trip mode.** Dates + per-day spend + per-head totals + multi-currency; the highest-willingness-to-pay context in the category.
6. **Voice/NL quick capture** — the conversation parser already exists; expose it as a one-tap "say the expense" affordance and a home-screen widget.
7. **Couples/roommates recurring packs** — templates (rent, utilities, subscriptions) with shares memory; subscription-sharing tracker with renewal reminders.
8. **Financial insights that answer questions** — "what did this trip cost me?", month-over-month by category; deterministic engine already computes most of this.

---

## 9. Competitive Differentiators

**Already built, unique or rare in the market:**
- No-account share links with payment QR (vs. Splitwise's account wall)
- AI receipt → itemized draft chain with on-device OCR fallback
- Natural-language expense chat
- Self-report → confirm payment workflow (fits cash/GCash reality)
- Multi-payer + itemized splits in the free product
- PH-localized payment rails (GCash/bank + QR)

**Structural advantages:**
- Modern stack (RSC, realtime, PWA) vs. Splitwise's legacy surface
- Costless deterministic fallbacks under every AI feature
- Clean monorepo able to ship web+mobile in lockstep
- **Positioning inversion available:** unlimited free logging + free receipt scanning + no ads before saving — everything Splitwise users are angriest about, at zero marginal cost to this architecture

**Where SettleUp cannot differentiate (accept and defer):** the payments-execution layer (Venmo/Tink/debit-card equivalents), the global network effect, and 100+ currency breadth. Win the PH beachhead first.

---

## 10. Prioritized Roadmap

Ranked within each tier by **Impact × User Value ÷ Dev Cost**. Sizes: S ≤ 1 wk · M ≤ 3 wk · L > 3 wk (single engineer).

### 10.1 Must have before launch

| # | Item | Size | Rationale |
|---|---|---|---|
| 1 | **Resolve the name** — trademark clearance; rename ("SettleUp" ↔ settleup.io collision) | S–M | App-store rejection / legal exposure / ASO futility. Blocks everything else. |
| 2 | **Turn AI on in production** — fix phantom `gpt-5.4-mini` default, set env, validate AI sums against totals, `.strict()` schemas | S | The product's identity is currently switched off; sum validation prevents bad money data |
| 3 | **Expense date field** (schema + forms + sort/insights/export) | S | Ledger correctness; every competitor has it |
| 4 | **Fix QR unmasking in public share payloads** (signed short-lived URLs or auth-gate the QR) | S | Visible privacy promise currently broken |
| 5 | **Percentage + shares split modes** (convert to cents at save; DB unchanged) | S–M | Splitwise free-tier parity; rent/couples use cases |
| 6 | **Mobile deep links + universal links** for `/g/*`, `/p/*`, `/join`; push-tap routing | M | The growth loop currently dumps mobile users into the web app |
| 7 | **Reminders**: debt-age push/email nudges + weekly digest; notification tap → group | M | The retention loop; "the app that reminds is the app that gets paid back" |
| 8 | **RLS/RPC integration test suite** (pgTAP or supabase-js harness against local stack) | M | The security model and settlement math are hand-verified today; calc bugs are the category's #1 trust killer |
| 9 | **Kill the waitlist wall**; landing page that demos scan→split and share links | S | Can't compete from behind a waitlist |
| 10 | Expense pagination + non-transactional `addExpensesBatch` fix | S | Perf cliff + partial-write corruption on the flagship scan flow |

### 10.2 High-impact improvements (fast follow)

| # | Item | Size | Rationale |
|---|---|---|---|
| 11 | **Multi-currency groups + FX** (currency per group & per expense, minor-unit-aware, daily rate snapshot; balances in group home currency) | L | Unlocks travel — the category's #1 acquisition moment. Biggest single competitive unlock |
| 12 | **Offline expense entry** — mobile: persisted react-query cache + outbound mutation queue; web: IndexedDB draft queue | L | Table stakes (Splid/Tricount/Settle Up all have it); restaurants and islands are dead zones |
| 13 | **1:1 friends ledger** — hidden two-person groups surfaced as a Friends tab + cross-group person rollup | M–L | Half of Splitwise usage; removes the "fake group" workaround |
| 14 | **GCash deep-link settlement** (send/request prefilled via deep link + QR Ph InstaPay from settle screen) | M | The Splitser move; nobody settles in PH rails |
| 15 | **Splitwise/CSV import** | M | Aimed directly at the defector stream Splitwise's caps create |
| 16 | Global search (expenses, groups, members) | M | QoL that compounds with account age |
| 17 | Dark mode (web + mobile) | M | Baseline 2026 consumer expectation; top review-complaint category |
| 18 | Edit history on expenses ("edited by X", change log) | M | Trust in shared money; dispute resolution |
| 19 | Partial-payment UX (explicit remaining-balance affordance) | S | Splitwise's longest-standing "under review" request |
| 20 | Web push + notification center | M | Awareness when the PWA is closed |

### 10.3 Delight features

- **"Claim your items"**: post-scan share link where each friend taps their line items, no account needed — fuses the app's two differentiators into one table-side viral moment (the infra — share tokens + itemized expenses — already exists)
- **Voice/chat quick capture**: surface the existing conversation parser as a one-tap "say the expense" + home-screen widget
- **Utang-aware reminders with personality**: escalating, Taglish-optional, creditor-approved nudges
- **Trip mode**: dates, per-day burn, per-head totals, (later) multi-currency rollup
- **Settle-up celebrations**: the all-settled state is already celebrated; add group "trip wrapped" summaries (top spender, biggest bill, category donut) — shareable
- **Recurring packs** for roommates/couples: rent/utilities/subscription templates with remembered ratios

### 10.4 Long-term vision

- **Subscription sharing** (track Netflix/Spotify family slots, renewal reminders, auto-recurring splits)
- **Budgeting + insights across groups** (the deterministic engine already computes most inputs)
- **True payment execution** if/when PH rails open (GCash partner API, QR Ph interop) — the Cino/Splitwise-Card endgame, PH edition
- **Group premium, one-time, split-as-an-expense** monetization (Settle Up's documented pattern; anti-subscription, PH-price-sensitive)
- **Open ecosystem posture**: exports, backups, maybe a public API — the anti-lock-in brand Splitwise abandoned
- Regional expansion along remittance corridors (SEA neighbors with similar wallet-first rails: GoPay/OVO Indonesia, TrueMoney Thailand)

---

## 11. Overall Readiness Score

| Area | Score /10 | Notes |
|---|---|---|
| Feature completeness | **6** | Group ledger is deep (multi-payer, itemized, recurring, comments, budgets); missing currencies, dates, friends ledger, %/shares splits, search |
| Ease of use | **7** | Quick-add and share links are excellent; email-confirm wall, no deep links, clipboard-only reminders drag it down |
| Visual design | **7** | Post-redesign UI is modern, consistent, tokenized; no dark mode; fake sparkline; thin charts |
| Performance | **6** | Lean bundles, single-RPC dashboard, realtime; unpaginated lists and coarse refresh-per-event will bite |
| Reliability | **5** | Correct tested money math, but zero RLS/RPC/E2E tests, no offline tolerance, non-transactional batch path |
| Technical quality | **7.5** | Genuinely strong architecture, security discipline, and conventions; docs drift, triple AI surface, in-memory limiters |
| Mobile experience | **6** | Full feature parity, 5 entry modes, haptics, realtime — undermined by no offline persistence, no deep links, dead-end push taps |
| User delight | **5** | The delight features exist but are switched off (AI) or unreachable (share links → web on mobile); checklist & celebrations show the right instincts |
| Competitive differentiation | **5 today / 8 potential** | As shipped: share links + GCash profiles. With AI on + claim-your-items + GCash settlement: category-leading in PH |
| Growth potential | **7** | Real wedge (PH + Splitwise backlash), viral share-link mechanics, modern stack; capped by name collision and missing travel/multi-currency |

**Overall: 5.4/10 — a strong foundation that is not yet a competitive product.**

### If launched publicly today, why would someone choose this over Splitwise?

Honest answer: **most people wouldn't, yet.** The credible pitch today is: *"unlimited free logging with no ads, your friends see their balance and your GCash QR from a link without installing anything."* That's real — but it only wins the narrow case of a PHP-only group whose organizer tolerates a product with no expense dates, no offline entry, no reminders, and a name that Googles to a competitor. Splitwise still wins on network, friends ledger, currencies, offline, and reminders. **After the Must-Have list ships** (name, AI on, dates, %/shares, deep links, reminders), the pitch becomes *"the only splitter built for how Filipinos actually pay each other — scan the receipt, everyone claims their items, settle in GCash in two taps, unlimited and free"* — and that wins the PH market on merit, because nobody else is even trying to.

### Biggest competitive risks

1. Name/trademark collision with Settle Up (existential for distribution)
2. GCash extends KKB into a persistent ledger (platform risk — speed matters)
3. Calculation/sync trust failures at scale with an untested SQL surface (the #1 review-killer across all competitors)
4. AI cost/quality economics once `LLM_ENABLED` is on for free users (mitigated by on-device OCR + deterministic fallbacks)
5. Splitwise's payments moat deepening while SettleUp is still on tracking

### Biggest strengths

1. Security-first, correctly-rounded, well-conventioned codebase — rare at this stage
2. No-account share-link participation model (best onboarding pattern in the category)
3. AI entry stack with graceful deterministic fallbacks — free-tier receipt itemization would beat Splitwise Pro
4. PH-native settlement context (GCash/bank QR profiles) in an unserved market

### Biggest opportunities

1. The Splitser-of-the-Philippines position (ledger + local rails + utang culture)
2. Splitwise's monetization backlash as a permanent acquisition channel (imports + "unlimited free" messaging)
3. "Claim your items" as the signature viral flow
4. One-time / group-funded premium as an anti-subscription brand statement

---

## 12. Top 20 Highest-Impact Improvements

Ordered by Impact × User Value ÷ Dev Cost across all sections:

1. **Rename the product** after trademark clearance (§7.3, §11 risks)
2. **Enable AI in production + fix `gpt-5.4-mini` phantom default** (`packages/ai/src/core/openai.ts:16`)
3. **Add `expense_date`** to schema, forms, exports, insights
4. **Validate AI splits/receipts sum to totals; `.strict()` AI schemas** (guards the flagship flow)
5. **Fix public-payload QR unmasking** (`20260403000006_mask_public_rpc_data.sql`)
6. **Percentage & shares split modes**
7. **Mobile universal links + push-tap routing** (close the growth-loop leak)
8. **Debt reminders + weekly digest** (retention engine)
9. **Multi-currency groups with FX conversion** (travel unlock)
10. **Offline expense entry** (mobile persistence + mutation queue)
11. **1:1 friends ledger** (hidden pair groups + person rollup)
12. **GCash deep-link / QR Ph settlement from the settle screen**
13. **"Claim your items" post-scan share flow** (signature feature)
14. **RLS/RPC/settlement-math integration tests** (trust insurance)
15. **Splitwise CSV import** (defector funnel)
16. **Dark mode** (web + mobile)
17. **Global search**
18. **Expense pagination + transactional batch insert**
19. **Edit history / audit trail on expenses**
20. **Real charts** (replace decorative sparkline; category donut, spend-over-time) **+ kill the waitlist landing page**

---

*Report compiled from: full dev-branch codebase audit (web, mobile, packages, 70 Supabase migrations, `docs/audit-report.md` cross-check) and July 2026 market research on Splitwise, Tricount, Settle Up, Splid, Kittysplit, Spliit, Tab, Cino, Splitser, GCash KKB, and the 2024–26 indie wave. Sources cited in research briefs; key facts: Splitwise Pro ~$40/yr with ~3–4 free expenses/day since Dec 2023; Tricount free under bunq; Splid $4.99 one-time; GCash 94M users.*
