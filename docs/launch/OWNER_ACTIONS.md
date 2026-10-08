# Owner actions

The only checklist of things that need your accounts, dashboards, devices or approval. It replaces
`docs/owner-setup.md` (kept as a pointer). Ordered by impact. Nothing here contains secret values.

Already done by Claude on 2026-10-08: branch `audit/talli-v1` pushed; draft PR
manoloenriquez/settleup#5 opened; CI green including the first `db-tests` run.

## 1. Deploy the web app (friend links and universal links are broken until then)

Production (`settleup-ivory.vercel.app`) still serves the 15 August `main` build: `/f/<token>`
returns 404 and `/.well-known/apple-app-site-association` returns 404.

1. Review and merge PR manoloenriquez/settleup#5 into `main` (Vercel deploys `main` to production),
   or promote the branch's preview deployment in Vercel.
2. Vercel → Project → Settings → Environment Variables (Production): `IOS_TEAM_ID=L8Y7B5Z7EQ`,
   `IOS_BUNDLE_IDENTIFIER=com.manoloenriquez.talli`. Redeploy.
3. Check:
   ```bash
   curl -s https://settleup-ivory.vercel.app/.well-known/apple-app-site-association
   ```
   Expected: JSON containing `L8Y7B5Z7EQ.com.manoloenriquez.talli`. Then open a friend invite link on
   an iPhone with the app installed: it opens the app, not Safari.

## 2. Apply the analytics migrations (together, in this order)

Never apply `product_events` alone: by itself it would count every app's sign-ups on the shared
`auth.users` as Talli accounts until the second migration removes that trigger.

1. `supabase/migrations/20260909130000_product_events.sql`
2. `supabase/migrations/20261001160000_product_events_talli_accounts_only.sql`
3. `supabase/migrations/20261001180000_group_settled_per_currency.sql`

Then run `supabase/tests/product_events.sql` against the project (it rolls back). All three pass
locally and in CI.

## 3. Turn on push notifications

1. `openssl rand -hex 32` → keep it as the webhook secret.
2. `supabase functions deploy send-push --no-verify-jwt`; set function secrets
   `PUSH_WEBHOOK_SECRET=<secret>` (and `EXPO_ACCESS_TOKEN` if you use Expo enhanced security).
3. SQL: `insert into settleup.app_config(key, value) values ('push_webhook_url', 'https://melogtpslinfzphvptyu.supabase.co/functions/v1/send-push'), ('push_webhook_secret', '<secret>');`
4. Check on two phones: an expense added on one shows "New expense: … (₱…)" on the other; a USD
   expense shows `$`.

## 4. Crash reporting

Create a Sentry React Native project; set `EXPO_PUBLIC_SENTRY_DSN` (and optionally
`EXPO_PUBLIC_SENTRY_ENV=production`) in `apps/mobile/.env` before the next archive. Web reads
`NEXT_PUBLIC_SENTRY_DSN`. `pnpm check:launch-config` warns while any is missing.

## 5. Sign in with Apple (required for App Review because Google sign-in is offered)

Supabase → Authentication → Providers → Apple: enable; add `com.manoloenriquez.talli` as an
authorized client ID. Then set `EXPO_PUBLIC_APPLE_SIGN_IN=true` in `apps/mobile/.env` for the next
build.

## 6. Auth URLs and email

1. Supabase → Authentication → URL Configuration → Redirect URLs: add `talli://auth/callback` (keep
   `tabkind://auth/callback` until no installed build uses it).
2. Confirm the confirmation and password-recovery emails arrive from your sending domain: register a
   new address you control, open the link on the phone (should land in the app signed in), then use
   "Forgot password".
3. Google sign-in on the phone end to end.

## 7. App Store Connect

1. Reserve the name **Talli: Split Bills** (the bare name "Talli" is taken) and run a trademark check.
2. App Privacy answers (unchanged by the Assistant — it collects nothing): contact info (email),
   user content (expenses, groups, payments, notes), identifiers (user ID), usage data (first-party
   product events), diagnostics (only if Sentry is on). Not used for tracking.
3. Privacy policy URL: `https://<web domain>/privacy` (updated 2026-10-08).
4. Review notes: a demo account with a group and expenses, and a note that Apple Intelligence
   features need an iPhone 15 Pro or later with Apple Intelligence on (everything else works without).
5. Do not submit for review until `docs/launch/RELEASE_REPORT.md` says GO.

## 8. Physical iPhone checks (build 6 when uploaded; see `docs/testflight.md`)

On an Apple Intelligence iPhone (15 Pro or later, iOS 27, Apple Intelligence on):

| Check | Expected |
|---|---|
| Install over build 5 with data | Opens without the error screen; groups, personal expenses and pending changes intact |
| Assistant: "I paid 500 for lunch with <member> in <group>" | Preview card, nothing saved until Confirm; Confirm → "Expense added"; Undo removes it |
| Assistant in airplane mode: "I paid 180 for coffee" then Confirm | "Saved…" ; for a group expense "…on this iPhone — it will sync" and it appears once after reconnecting |
| Assistant: "How much does <member> owe me?" | Same amounts as the group's Balances tab |
| Receipt in the Assistant, then "add this to <group>, split equally" | Total equals the printed total; a smudged receipt asks for the total instead |
| Receipt scan in Add Expense, online and in airplane mode | Both work; photo never uploaded |
| Dark Mode, largest text size on the Assistant | Composer above the tab bar, cards readable, buttons ≥ 44 pt |
| Edit a group expense: change date, switch to %, 60/40 | Saved shares match the preview; other phone shows the new date |
| Payment details: add QR from Photos, remove it | Works; QR gone from shared link |
| After step 1: friend invite link between two phones | Opens the app and accepts |
| After step 3: push for a new expense | Arrives; tap opens the group |

On an iPhone without Apple Intelligence: the Assistant says so and still handles common phrasings
("I paid 300 for lunch", "Who owes me?").

## 9. TestFlight build 6

Build 6 was uploaded on 2026-10-08 (archive checked: build 6, live Supabase project, no local
addresses; upgrade from build 5 passed on the simulator). When App Store Connect finishes processing
it, add it to your tester group and run the checklist in step 8. Builds after this one follow
`docs/testflight.md`.
