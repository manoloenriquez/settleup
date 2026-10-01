# Owner setup — remaining steps (1 October 2026)

Everything here needs the owner's accounts or was blocked for Claude by the
Claude Code permission check. In order of impact.

## 1. Deploy the current web app (friend links are broken until then)

`https://settleup-ivory.vercel.app` (the `EXPO_PUBLIC_WEB_URL` in builds 3–5)
still runs a build from before friends and the audit: `/f/<token>` friend
invite links return 404, and `/.well-known/apple-app-site-association` is
missing, so links open in Safari instead of the app.

1. Push the branch and merge it (step 2), or deploy `audit/talli-v1` directly.
2. In that Vercel project set `IOS_TEAM_ID=L8Y7B5Z7EQ` and
   `IOS_BUNDLE_IDENTIFIER=com.manoloenriquez.talli`, then redeploy.
3. Check: `curl -I https://settleup-ivory.vercel.app/.well-known/apple-app-site-association`
   returns 200, and a friend invite link opens the invite page.

## 2. Push the branch (blocked for Claude: "Out-of-Place Publication")

```bash
git push -u origin audit/talli-v1
```
Then open a PR into `main`. CI runs the SQL test suite (`db-tests`) for the
first time. The repo is public; a scan found no secrets in tracked files.

## 3. Apply the analytics migrations (blocked for Claude: "Modify Shared Resources")

Apply these **together and in this order** (Supabase SQL editor or
`supabase db push`), never `product_events` on its own: on its own it adds a
trigger to the shared `auth.users` table that would count every app's
sign-ups as Talli accounts until `20261001160000` removes it.

1. `supabase/migrations/20260909130000_product_events.sql`
2. `supabase/migrations/20261001160000_product_events_talli_accounts_only.sql`
3. `supabase/migrations/20261001180000_group_settled_per_currency.sql`

Then run `supabase/tests/product_events.sql` (it rolls back).
Already live: `20260909120000_push_delivery_payload`,
`20261001170000_push_messages_in_expense_currency`.

## 4. Turn on push notifications

The database side is live but stays a no-op until configured.

1. Generate a secret: `openssl rand -hex 32`.
2. Deploy the function: `supabase functions deploy send-push --no-verify-jwt`
   and set its secrets `PUSH_WEBHOOK_SECRET=<secret>` (and `EXPO_ACCESS_TOKEN`
   if you use Expo's enhanced push security).
3. In SQL: `insert into settleup.app_config(key, value) values
   ('push_webhook_url', 'https://melogtpslinfzphvptyu.supabase.co/functions/v1/send-push'),
   ('push_webhook_secret', '<secret>');`
4. Add an expense on one phone; the other member's phone should get
   "New expense: … (₱…)".

## 5. Crash reporting (Sentry)

Create a React Native project in Sentry, then set `EXPO_PUBLIC_SENTRY_DSN`
(and optionally `EXPO_PUBLIC_SENTRY_ENV=production`) in `apps/mobile/.env`
before the next build. The web app reads `NEXT_PUBLIC_SENTRY_DSN`. Without it,
crashes on testers' phones are invisible (build 2's launch crash was only
seen through a screenshot).

## 6. Sign in with Apple

Supabase dashboard → Authentication → Providers → Apple: enable, add
`com.manoloenriquez.talli` as an authorized client ID (native sign-in needs no
Services ID secret). Then set `EXPO_PUBLIC_APPLE_SIGN_IN=true` in
`apps/mobile/.env` for the next build; the button stays hidden until then.

## 7. Auth redirects

Supabase dashboard → Authentication → URL Configuration → Redirect URLs: add
`talli://auth/callback` (keep `tabkind://` until a build no longer uses it).

## 8. On a phone (TestFlight build 5)

- Update from build 3/4: opens without the error screen.
- Dark Mode: headers, tab bar, menus and sheets match the app.
- Apple Intelligence: scan a receipt online and in airplane mode.
- Payment Details: upload a QR from Photos, save, remove it.
- After steps 1 and 4: a friend invite link between two phones; a push
  notification for a new expense.
