# Launch implementation plan

Drafted 2026-09-09 from `main` at `53a1043`. Continues the launch-readiness work tracked in `launch-readiness.md`; the product authority is the user-owned `PRD.md`.

**Goal.** Bring the repository to the point where every remaining public-beta gate needs something only the owner can supply (a domain, credentials, signing identities, devices, testers), and nothing is blocked on code.

## Decisions this plan assumes

Each of these changes scope. They are stated so the owner can overturn them before work starts.

| # | Decision | Basis |
|---|----------|-------|
| D1 | **Launch PHP-only. Leave `20260908163441_currency_ledger.sql` unapplied and do not thread currency selectors through the clients.** | PRD 2.3 assumes PHP-only; PRD 13.3 puts multi-currency in P2; PRD 18 says not to begin it before the PH-first loop is validated. The clients have no runtime dependency on the migration (all money RPCs are legacy names, the builders' extra `currency_code` key is ignored by the live functions, and result parsers default to PHP). The foundation stays in the repo for later. |
| D2 | **Credits and refunds are not a launch feature.** Every live write function and a validating `CHECK (amount_cents > 0)` reject negative expenses, so no credit can exist in the database. The two "not editable yet" blocks and the credit badges stay as defensive code; the AI draft schema is tightened to match the write schemas. | Parity report: no RPC creates a credit; the 2026-04 constraint migration could only have applied to a database with zero negative rows. |
| D3 | **Signup stays open; the waitlist stays as an unlinked admin tool.** No code change. | PRD open decision 2 is the owner's. The waitlist gates nothing today, so "retain intentionally" costs nothing and "remove" is a one-line follow-up either way. |
| D4 | **Product events go to a first-party, insert-only Postgres table behind a typed shared `track()` API with a swappable sink.** No third-party vendor is chosen. | PRD open decision 9 (provider) is the owner's; a first-party sink is the most privacy-preserving default, keeps events visible in the existing admin surface, and lets a vendor be added later by swapping the sink. |
| D5 | **Push delivery moves the service role out of the Edge Function entirely.** The database builds the complete delivery payload (tokens plus minimal title/body) inside the existing trigger and posts it; the function only forwards to Expo. | Launch-readiness item; CLAUDE.md forbids service-role use outside the account-closure route, and that route no longer uses it either. |
| D6 | **Nothing is pushed, deployed, or applied to the remote database in this plan without the owner saying so.** Commits stay local. | Repository rules and the shared Supabase project. |

## Workstreams

Order is by risk reduction per hour. Reviewed by the Codex plan reviewer on 2026-09-09; both findings (mobile payer path, no IP-keyed limiter) were accepted and folded in. Each workstream ends in its own commit, runs the shared/web/mobile suites plus typecheck and lint, and is sent to the Codex code reviewer; if Codex is unavailable, an internal review is recorded in the commit message and the readiness doc.

### WS1. Bookkeeping (small)

- Prune the clean, fully merged `worktree-emerald-ui-redesign` worktree and branch.
- Refresh `launch-readiness.md`: record the five post-doc commits (per-account outboxes, replay credentials, `hasBeenSent`), the current test counts, and decisions D1 to D6.
- Leave `docs/PRD.md` untracked until the owner says whether it belongs in the repo.

### WS2. Correctness and config hardening (small)

- `expenseDraftSchema.amount_cents` becomes `.positive()`, matching every write schema (D2).
- Web AI rate limiter fails closed like the API limiter instead of falling back to a per-process memory limiter when the database RPC errors (PRD 11.3: no reliance on per-process memory).
- `scripts/check-launch-config.mjs` also requires the Supabase URL and anon key for web and mobile, `ALLOWED_ORIGINS` for the API, and warns when no Sentry DSN is set for web, mobile, or API.
- Remove the stale service-role key from `apps/api/.env.example` and `render.yaml`; replace the `settleup.app` default in `ALLOWED_ORIGINS` with a placeholder the launch check accepts.
- API account route returns `{ closed: true }` and the mobile caller is updated; the `.well-known` routes log a server-side warning when they serve an empty document in production.
- Add Sentry to the Hono API (`@sentry/node`), DSN-gated like web and mobile, so OPS-04 covers all three surfaces.

### WS3. Push notifications without service role (medium)

Migration `YYYYMMDDHHMMSS_push_delivery_payload.sql`:

- `notify_push_event()` resolves recipients and tokens in SQL (it is already `SECURITY DEFINER`), builds `{ messages: [{ to, title, body, data }] }` with no full-row dump, and posts that. Group name stays in the title; the body carries only item name or amount as today.
- `payment_pending` and `payment_confirmed` payloads carry `data.event` and `data.group_id`; `data.route` names the destination (`/groups/<id>` or `/groups/<id>/settle-up`).
- Keep the `app_config` toggle semantics: no URL or secret configured means no-op.

Edge Function `send-push`:

- Drop the Supabase client and `SUPABASE_SERVICE_ROLE_KEY`. Verify `x-push-secret`, forward to Expo in batches of 100 with `EXPO_ACCESS_TOKEN` when set, and log receipts.
- Return per-message ticket errors so `DeviceNotRegistered` tokens can be pruned by a narrow `settleup.prune_push_tokens(text[])` definer RPC called with the anon key plus the webhook secret checked inside the function. (Kept minimal: one write path, one table.)

Mobile:

- Notification tap routing honours `data.route` and falls back to the group screen.
- Register an `addPushTokenListener` so rotated Expo tokens are re-upserted.
- The account screen's push toggle reads the database row, not only AsyncStorage.

Add `supabase/functions/send-push/README.md` with the deploy and `app_config` seeding runbook and a `.env.example`.

### WS4. Product events (medium)

Migration `YYYYMMDDHHMMSS_product_events.sql`:

- `settleup.product_events(id, event_name, occurred_at, user_id null, platform, properties jsonb)`; `event_name` constrained to the 16 PRD names; `properties` constrained by a CHECK that allows only the PRD-listed keys with enumerated values (entry mode, participant bucket, error class, link type, status, action). No free text.
- RLS: authenticated users may insert rows with their own `user_id`; nobody may select except admins (via the existing `profiles.role` check); no update or delete.
- `settleup.track_public_event(share_token, event_name, properties)` definer RPC for anonymous public-link events, limited to the three public events. It resolves the token to a member or group ID and rate-limits on that ID with the same fixed-window pattern the anonymous payment limiter uses; no IP-keyed limiter exists in the codebase and Postgres cannot see the client address reliably. Invalid-token opens are recorded by the Next.js public page on the server side with an in-process throttle, since the database cannot attribute them to anything.
- Insert grants are per column so clients cannot set `occurred_at` or `id`.

Shared package:

- `packages/shared/src/analytics/`: a discriminated `ProductEvent` union mirroring the table CHECK, a `Sink` interface, and `track(event)` that never throws and never blocks. Unit tests assert the union and the table constraint list stay in sync.

Clients:

- Web and mobile sinks insert through the user's Supabase client; the public pages call the RPC. Instrument the sixteen events at their natural points: registration, group creation, member add, expense dialog open and save (including offline enqueue and outbox resolution), link copy, public page open, payment details copy and QR view, claim submit and resolve, AI draft generated and resolved, and a `group_settled` emission when a confirmed payment brings every balance to zero.
- Admin page gains a read-only recent-events table so events are visible without a vendor.

### WS5. Mobile AI draft parity (medium to large)

In `apps/mobile/app/(protected)/groups/[id]/add-expense.tsx` and supporting components:

- Chat drafts resolve names with the shared `resolveExactMember`, honour `payer_name`, and require explicit selection for unknown or ambiguous names before the draft can be reviewed. Nothing saves from the chat card; review writes into the shared form state and switches to Detailed, matching web.
- The chat draft merges into the main form state so switching modes does not destroy it.
- Receipt review becomes editable in-screen (reuse the `ReceiptItemEditor` from the scan tab) and acceptance produces an itemized draft with line items instead of collapsing to a total.
- Smart Split sets `splitMode` to `custom` when applied and reports unmatched names.
- The Quick and equal-split save path uses the payer chosen in the form instead of always the current user, and the multi-payer sum validation applies to every save path, matching web (Codex plan-review finding).
- Add a `notes` field to mobile entry and edit.
- Persist the in-progress draft per group in AsyncStorage so leaving the screen does not lose it.
- Tests: add `@testing-library/react-native` with a jsdom-free node setup for the resolution and gate logic extracted into a pure module (`src/lib/expense-draft.ts`) so the behaviour is unit-tested without rendering native components.

### WS6. SQL tests in CI and access-matrix coverage (medium)

- Add a CI job that starts a local Supabase (`supabase start`), applies migrations, runs `supabase/tests/*.sql` with `psql`, and fails on any `RAISE EXCEPTION`. The currency test runs against the unapplied migration explicitly loaded in its transaction, as it does locally.
- Extend `launch_security.sql` where the PRD matrix is not yet covered: rotated token, unrelated authenticated user, anonymous user on private RPCs, and public payload field allowlists for both link types.
- Add a `product_events` test to the new migration's coverage.

### WS7. Documentation (small)

- `docs/brain/03-supabase.md`: currency migration status and semantics, push delivery, product events.
- `docs/brain/04-offline.md`: per-account queues, `hasBeenSent`, replay credentials.
- `docs/brain/01-architecture.md`: analytics layer and sink.
- Final `launch-readiness.md` refresh listing exactly what remains owner-owned (below). Run `/dev-log`.

## Explicitly out of scope for this plan

- Currency selectors, per-currency cache keys, and applying the currency migration (D1).
- Percentage or share-weight splits, reminders, universal-link decision, monetisation, dark mode (PRD P1/P2).
- Web push.
- Choosing an analytics vendor.

## What will still be owner-owned after this plan

- Name clearance, domain, support mailbox, EAS project, Apple team and bundle, Android package and signing fingerprints; then `pnpm check:launch-config` against the real environment.
- Applying the two pending migrations from WS3 and WS4 to the shared Supabase project, seeding `app_config` push settings, and setting Edge Function secrets.
- Deploying web, API, and the Edge Function; ensuring `NODE_ENV=production` on the API host.
- Email confirmation and recovery delivery with a controlled inbox; Google OAuth end to end; auth redirect allowlist.
- Physical-device builds, notification taps, universal links, and the five-group validation run.
- Pushing `main` to `origin` (currently 20 commits ahead, will be more).
