# Tabkind launch implementation status

Updated 2026-09-10. **Not ready for public release.** This document tracks implementation and evidence, not a launch approval. The user-owned `docs/PRD.md` is unchanged. The remaining code work is sequenced in `docs/launch-implementation-plan.md`, which also records the scope decisions D1 to D6 (PHP-only launch, no credit feature, open signup, first-party product events, service-role-free push, nothing pushed or deployed without the owner).

## Source and deployment

Work is on `main`, fast-forward pulled from `origin/main` before implementation (baseline `e8495df`). Changes have not been pushed or deployed as a web/API/native release.

The user authorized testing in the existing Supabase project `melogtpslinfzphvptyu`. It is shared with other applications. Only the two migrations below have been applied. The migration service assigned different remote timestamps; do not blindly replay the entire repository migration directory against this shared project.

| Repository migration                                            | Applied remote version | SHA-256 of applied SQL                                             |
| --------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------ |
| `20260908053417_secure_claims_and_payment_reports.sql`          | `20260908162625`       | `6569b8617afca6a49740307de097dfc3b33c401175ce455000af0244e8e848f0` |
| `20260908160541_preserve_shared_ledgers_on_account_closure.sql` | `20260908162634`       | `998f522ce79b1d1e2ac768c3d47c2ae17cd9acdd62475f8b7f4ee330bbccdd3d` |

`20260908163441_currency_ledger.sql` is **unapplied**. Its migration and SQL fixtures have been executed together in rollback-only transactions, including immediate execution of deferred constraints. Finish client integration and validation before activation.

## Implemented

- Separate hashed, expiring, revocable membership-claim invitations. The old ID-only claim is no longer callable; public viewing tokens cannot establish membership.
- Atomic claim and payment resolution, authorization before replay success, public report IDs and database deduplication, and bounded database enforcement of anonymous report limits.
- Public report status history. Web report attempts are persisted before transmission and retained across refresh/lost responses. A separate payment requires an explicit new attempt.
- App-specific account closure preserves other members' financial records. Owned groups become read-only unless ownership was transferred first. Departed members cannot be claimed. Shared Supabase Auth identities are retained for other applications; global Auth deletion also preserves group ledgers through a trigger.
- Web password update and native recovery/callback screens, safe internal return destinations, invitation persistence through registration/OAuth, confirmation resend/change-address controls, and expired-link handling.
- Durable offline enqueue and atomic batch persistence before clearing forms; serialized overlapping queue writes. Unreadable persisted queues now stop sync instead of being overwritten as empty queues. Background failures are surfaced on both platforms.
- One web expense draft across Quick and Detailed entry; Chat and reviewed receipts prefill that draft before saving. Unknown/ambiguous AI names require explicit resolution. Notes, dates, payer and participant choices are preserved. Interaction tests cover switching modes and correcting AI output.
- Onboarding checklist actions open the relevant UI; sharing completion is based on actual successful copy. Landing page distinguishes creating and joining a group and explains guest viewing with an example.
- Working brand **Tabkind**, configurable support contact, web association-file routes, and configurable native link identities. No domain, trademark clearance, support mailbox, store registration, or signing identity has been purchased or fabricated.
- Expo dependencies aligned with SDK 54. Native callback, invitation and notification navigation are implemented. EAS submission placeholders removed; production configuration requires publisher identities.
- Offline queues, persisted balances and query clients are isolated per account; replay uses the credentials captured when the change was queued, so a later sign-in cannot replay another account's work. Conflicting drafts are retained rather than discarded, and comment replay verifies success instead of trusting a generic unique-violation. Entries record whether transmission ever started (`hasBeenSent`): deleting a draft whose create may already have reached the server now sends a delete instead of cancelling locally, and re-enqueueing an existing attempt with different details is refused so the draft is kept for review.
- Web AI limiting now fails closed on both the route handlers and the server actions when the shared database limiter is unavailable, matching the API. The AI draft schema rejects non-positive amounts like every write schema. The API reports unhandled errors to Sentry when a DSN is set, with request bodies, headers, cookies and IPs stripped. `pnpm check:launch-config` also requires the Supabase, API and CORS settings, rejects any service-role key, and warns when a surface has no Sentry DSN.
- **Push without service role** (migration `20260909120000`, unapplied remotely): the database builds the finished Expo messages inside the trigger and posts only those; the Edge Function verifies the shared secret, forwards to Expo, and prunes unregistered tokens through one secret-guarded RPC. Mobile honours the payload route, re-registers rotated device tokens as Expo tokens, and reads the push toggle from the server row. Runbook in `supabase/functions/send-push/README.md`. The function was not compiled locally (no Deno) and no device delivery has been exercised.
- **Product events** (migration `20260909130000`, unapplied remotely): the sixteen PRD 12.4 events in a first-party `settleup.product_events` table with a database-enforced allowlist of enumerated properties (no free text, so no names, amounts, tokens or receipt content can be stored). Signed-in inserts under RLS; anonymous public-link events through a token-resolved, rate-limited RPC; `account_created` and `group_settled` derived on the server; admin-only reads with a recent-events table on the admin page. Web and mobile emit every event at its natural point. No vendor is chosen (decision D4); the sink is swappable.
- **Native AI draft parity**: chat suggestions resolve names only by exact match and require explicit choices for unknown or ambiguous names before review; nothing saves from the AI card; review lands in the editable Detailed form. Receipts are edited in place and become itemized drafts with a shared "Tax & charges" line so totals match the receipt. Smart Split switches the split to custom and reports unmatched names. Notes exist on native entry and edit. Equal splits with several payers send every payer. In-progress drafts persist per account and group.
- **SQL tests in CI**: a `db-tests` job starts a local Supabase with every migration applied and runs `supabase/tests/*.sql`. New tests cover push message building and pruning, product events (allowlist, RLS, anonymous limiter, closure detachment, server-derived events) and the PRD access matrix for public payloads (anonymous and unrelated callers, field allowlists for both link types, masked account numbers, rotation without existence leaks). **None of the new SQL tests have been executed here**: this machine has no Supabase CLI, Docker or database connection. The first CI run is the evidence.

## Currency foundation (deferred; decision D1)

The new shared money representation is `{ currency_code, amount_minor }`. The supported registry explicitly defines zero, two and three decimal precision. Parsing validates locale grouping and exact minor-unit precision; formatting preserves safe integer values, including large amounts. Debt calculations reject mixed currency inputs.

The unapplied migration retains historical `*_cents` column names as integer minor units adjacent to an explicit currency code. Existing expenses, payments, recurring templates and budgets are backfilled as PHP with no numeric conversion. Groups have a default entry currency. Versioned RPCs calculate each currency separately and carry its code; legacy money RPCs reject mixed/foreign ledgers with `PT426`. Direct legacy reads cannot interpret foreign amounts as PHP. Expense edits compare currency and lock the row before checking the stale-edit timestamp.

**Launch decision D1:** the public beta is PHP-only, as the PRD assumes (sections 2.3, 13.3 and 18). The migration stays unapplied and no currency selectors are threaded through the clients. This is safe because no client calls a versioned RPC or sends `x-ledger-version`; the builders' extra `currency_code` key is ignored by the live functions, and every result parser defaults absent codes to PHP. Should the migration be applied later while clients are unchanged, PHP-only data keeps working; the first non-PHP row would make the legacy dashboard, groups and activity RPCs raise `PT426` for that whole account.

Still required before enabling currency entry (post-validation, PRD P2):

1. Currency selectors and per-currency query/cache keys across web and mobile, public views, dashboards, activity, charts, budgets and payment histories. Emit `x-ledger-version: 2` only once every direct financial read is correctly scoped.
2. Carry selected codes through all actions/services, forms, recurring inputs, AI prompts/drafts, payment retries, exports and outbox summaries/replay. The shared schemas/builders and database types have currency fields; many callers still use PHP defaults.
3. Version/migrate persisted caches and outboxes without discarding queued work or allowing another account to replay it. Verify account switching, cross-tab coordination and app upgrades with queued changes.
4. Complete coverage for itemized/multiple-payer refunds, recurring generation and cross-currency edits on actual database constraints. Do not infer public readiness from the currency foundation tests alone.

## Validation evidence

- Full suite at the previous checkpoint: 296 tests (207 shared, 30 web, 27 mobile, 32 AI). At `main` after the 2026-09-10 work: **345 tests pass** (228 shared, 39 web, 46 mobile, 32 AI). Lint and typecheck pass for all six workspaces; the production web build passed after the product-events change.
- Production web builds pass with existing Sentry/OpenTelemetry, libheif and Next ESLint integration warnings.
- Both iOS and Android JavaScript exports succeeded after SDK alignment. This is not a signed native release build or physical-device verification.
- `supabase/tests/launch_security.sql`, `account_closure.sql`, and `currency_ledger.sql` pass using transactional fixtures. They leave no test users, groups or payments. The tests also pass with the prospective currency migration loaded in the same rolled-back transaction and deferred constraints forced immediately.
- Browser checks verified the revised registration screen, retained invitation destination, invalid-input feedback and recovery callback routing. An expired-link message was added after this check exposed missing context on the destination screen.
- **Registration has not been completed with email verification.** No controlled inbox was provided; confirmation/recovery delivery, Google OAuth end-to-end, the second-user journey and five independent groups remain unverified.
- Post-deployment security advisors no longer flag a mutable search path in `settleup`. Private internal tables intentionally deny direct access through RLS with no policies. The four anonymous definer RPCs are intentional token-scoped guest APIs. See [anonymous definer review guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [RLS-without-policy guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). Other applications' advisor findings were not changed.

## Remaining launch work

- Credit editing is dropped from launch scope (decision D2): no live function can create a negative expense and a validating check constraint forbids one, so the credit badges and "not editable yet" guards are defensive code for a representation that cannot exist in the database.
- Apply migrations `20260909120000_push_delivery_payload` and `20260909130000_product_events` to the shared project (they do not depend on the deferred currency migration), deploy `send-push` with `--no-verify-jwt`, set `PUSH_WEBHOOK_SECRET` (and ideally `EXPO_ACCESS_TOKEN`), seed `settleup.app_config`, and remove `SUPABASE_SERVICE_ROLE_KEY` from the function's secrets. Then exercise a notification tap on a physical device.
- Deploy the updated API account-closure route along with clients; an old deployed route must not continue global Auth deletion on this shared project. The route no longer needs a service-role key; remove it from the deployed service's environment.
- Native edit still cannot change the expense date (web can). Percentage and share splits remain P1.
- Watch the first CI run of the `db-tests` job; it is the first execution of the push, product-events and public-payload SQL tests.
- Verify confirmation/recovery email delivery, auth redirect allowlists, cold/warm native links, owned domain and support delivery, signing/store builds, backups/restoration, monitoring and AI usage limits.
- Validate full core journeys on desktop, mobile Safari/Chrome and physical iOS/Android, then have five independent groups complete them without assistance.

The next competitive phase remains friends/one-to-one balances, previewed imports and allocation exports, saved household splits and recurring/reminder management, cross-group search and audit history. Paid conversion/reporting/AI extras remain later options; manual logging, groups, balances and settlement records stay free.

## Release configuration

Use the checked-in `.env.example` files, then run `pnpm check:launch-config` with the release environment. Missing settings are reported without printing their values. Required identities include the owned web origin, a verified support mailbox, EAS project, iOS team/bundle, Android package and Play signing fingerprints. Configure the matching Auth redirect allowlist and verify both `/.well-known/` routes from the deployed HTTPS domain. Presence checks are not evidence of ownership, mailbox delivery or verified native links.

## Apple Intelligence migration (2026-10-01)

All language-model features moved on-device (FoundationModels + Vision, iOS 27).
OpenAI, the `/ai/*` API routes, the web `/api/ai/*` handlers, the AI rate
limiter and every AI provider key were removed; `packages/ai` keeps only the
deterministic web helpers. The iOS minimum deployment target is 27.0. Receipt
numbers are reconciled against the OCR text and receipt arithmetic in
`packages/shared` (`reconcileReceiptExtraction`), and the review screen shows
per-field states instead of a confidence percentage. Regression check:
`pnpm eval:receipts` (design, device requirements and results in
`docs/brain/05-apple-intelligence.md`). Web and Android keep the deterministic
paths only; the UI says AI needs an iPhone with Apple Intelligence.

