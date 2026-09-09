# 03 — Supabase

## Local Development Setup

```bash
# 1. Install Supabase CLI (once)
brew install supabase/tap/supabase

# 2. Start local stack (Docker required)
pnpm supabase start

# 3. Apply migrations + seed data
pnpm supabase db reset

# 4. Generate TypeScript types from local DB
pnpm supabase gen types typescript --local \
  > packages/supabase/src/database.types.ts
```

Local Studio: http://localhost:54323
Local API:    http://localhost:54321

## Migrations

Create a new migration:

```bash
# Manual (preferred — use exact timestamp)
touch supabase/migrations/YYYYMMDDHHMMSS_description.sql
```

Apply locally:

```bash
pnpm supabase db reset   # reset + re-apply all migrations + seed
pnpm supabase db push    # apply pending without resetting
```

Push to remote (production):

```bash
pnpm supabase db push --linked
```

**Never edit an already-applied migration.** Always write a new one.

**Recreating a SECURITY DEFINER function? Re-check its `search_path`.**
`DROP FUNCTION` + `CREATE FUNCTION` discards the function's config, including
any `ALTER FUNCTION … SET search_path` applied by a later migration — so a
recreation can silently revert an earlier fix. Anything calling pgcrypto
(`gen_random_bytes`, used for share tokens and invite codes) needs
`SET search_path = settleup, extensions`; Supabase installs pgcrypto in the
`extensions` schema, which a bare `search_path = settleup` hides. See
`20260602000003`, `20260615000000`, and `20260814093000` — three separate
fixes for this same trap. Verify with:

```sql
SELECT proname, proconfig FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'settleup' AND p.prosrc LIKE '%gen_random_bytes%';
```

## Row Level Security

**Every table must have RLS enabled. No exceptions.**

Template for a settleup group-owned table:

```sql
ALTER TABLE settleup.expenses ENABLE ROW LEVEL SECURITY;

-- Group members can read expenses in their groups
CREATE POLICY "members_select" ON settleup.expenses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM settleup.group_members gm
      WHERE gm.group_id = expenses.group_id
        AND gm.user_id = auth.uid()
    )
  );
```

## Auth

Web — Server Actions:

```ts
import { assertAuth } from "@/lib/supabase/guards";

const user = await assertAuth(); // throws if unauthenticated
```

Mobile — use `onAuthStateChange` exclusively (not `getSession()`):

```ts
supabase.auth.onAuthStateChange((event, session) => {
  setSession(session);
});
```

## Storage

Buckets are created via migrations. Storage paths use `{userId}/{type}-{uuid}.ext`.

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false);

CREATE POLICY "owner upload" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'receipts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

Validate MIME type + file size in the Server Action before uploading.

## Environment Variables

| Variable                         | Where used          | Notes                        |
|----------------------------------|---------------------|------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`       | Web (client+server) | Safe to expose               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | Web (client+server) | RLS enforced                 |
| `SUPABASE_SERVICE_ROLE_KEY`      | Never in app code   | Bypasses RLS — keep secret   |
| `EXPO_PUBLIC_SUPABASE_URL`       | Mobile              | Bundled in binary            |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY`  | Mobile              | RLS enforced                 |

## Schema Reference

All SettleUp tables live in the **`settleup` schema**. Query with `.schema("settleup").from(...)`.

### `settleup.groups`
| Column           | Type          | Notes                                    |
|------------------|---------------|------------------------------------------|
| `id`             | `uuid`        | PK                                       |
| `name`           | `text`        |                                          |
| `owner_user_id`  | `uuid?`       | FK → `auth.users(id)`                   |
| `invite_code`    | `text`        | Unique                                   |
| `is_archived`    | `boolean`     | Default: `false`                         |
| `share_token`    | `text`        | Unique, auto-generated via trigger       |
| `created_at`     | `timestamptz` |                                          |

### `settleup.group_members`
| Column         | Type          | Notes                                    |
|----------------|---------------|------------------------------------------|
| `id`           | `uuid`        | PK                                       |
| `group_id`     | `uuid`        | FK → `groups(id)`                       |
| `display_name` | `text`        |                                          |
| `slug`         | `text`        | URL-safe name                            |
| `share_token`  | `text`        | Unique, for friend/share view            |
| `user_id`      | `uuid?`       | FK → `auth.users(id)`, nullable until claimed |
| `created_at`   | `timestamptz` |                                          |

### `settleup.expenses`
| Column                | Type          | Notes                          |
|-----------------------|---------------|--------------------------------|
| `id`                  | `uuid`        | PK                             |
| `group_id`            | `uuid`        | FK → `groups(id)`             |
| `item_name`           | `text`        |                                |
| `amount_cents`        | `integer`     | Total amount in cents          |
| `notes`               | `text?`       |                                |
| `created_by_user_id`  | `uuid?`       | FK → `auth.users(id)`, audit  |
| `created_at`          | `timestamptz` |                                |
| `updated_at`          | `timestamptz` | Touch trigger; CAS guard for offline edits |

`create_expense` / `create_itemized_expense` accept an optional client `id`
(idempotent replay: existing row returned with `"replayed": true`; mismatch →
SQLSTATE `PT409`). `update_expense` / `update_itemized_expense` accept an
optional `expected_updated_at` (stale → `PT409`; missing row → `PT404`).
`record_payment` accepts an optional `p_id` with the same replay semantics.
See `docs/brain/04-offline.md`.

### `settleup.expense_payers`
| Column        | Type      | Notes                               |
|---------------|-----------|-------------------------------------|
| `expense_id`  | `uuid`    | FK → `expenses(id)`                |
| `member_id`   | `uuid`    | FK → `group_members(id)`           |
| `paid_cents`  | `integer` | Amount this member paid             |

### `settleup.expense_participants`
| Column        | Type      | Notes                               |
|---------------|-----------|-------------------------------------|
| `expense_id`  | `uuid`    | FK → `expenses(id)`                |
| `member_id`   | `uuid`    | FK → `group_members(id)`           |
| `share_cents` | `integer` | This member's share                 |

### `settleup.payments`
| Column                | Type          | Notes                          |
|-----------------------|---------------|--------------------------------|
| `id`                  | `uuid`        | PK                             |
| `group_id`            | `uuid`        | FK → `groups(id)`             |
| `amount_cents`        | `integer`     |                                |
| `status`              | `text`        | Default: `'completed'`         |
| `from_member_id`      | `uuid?`       | Who paid                       |
| `to_member_id`        | `uuid?`       | Who received                   |
| `created_by_user_id`  | `uuid?`       | Audit                          |
| `created_at`          | `timestamptz` |                                |
| `updated_at`          | `timestamptz` | Touch trigger                  |

### `settleup.user_payment_profiles`
| Column                 | Type          | Notes                         |
|------------------------|---------------|-------------------------------|
| `user_id`              | `uuid`        | PK, FK → `auth.users(id)`    |
| `payer_display_name`   | `text?`       |                               |
| `gcash_name`           | `text?`       |                               |
| `gcash_number`         | `text?`       |                               |
| `gcash_qr_url`         | `text?`       | Storage URL                   |
| `bank_name`            | `text?`       |                               |
| `bank_account_name`    | `text?`       |                               |
| `bank_account_number`  | `text?`       |                               |
| `bank_qr_url`          | `text?`       | Storage URL                   |
| `notes`                | `text?`       |                               |
| `updated_at`           | `timestamptz` |                               |

## Key RPCs

| Function                              | Auth     | Purpose                                             |
|---------------------------------------|----------|-----------------------------------------------------|
| `get_member_balances(p_group_id)`     | Authed   | Returns balance per member: `net_cents`, `owed_cents` |
| `get_friend_view(p_share_token)`      | Anon     | Public share page data — minimal member + payer info |
| `get_group_overview(p_share_token)`   | Anon     | Group-level overview via share token: balances, expenses (with payers, participant `member_id`s, per-item participants), PAID payments, masked creditor/owner payment profiles |
| `get_groups_with_stats()`             | Authed   | All groups for current user with expense totals     |

### Balance Formula

```
net_cents = paid_as_payer - shares - received_payments + sent_payments
owed_cents = GREATEST(0, -net_cents)
```

- Positive `net_cents` → others owe this member
- Negative `net_cents` → this member owes others

## RLS Summary

| Table                    | Operation     | Who                                      |
|--------------------------|---------------|------------------------------------------|
| `groups`                 | SELECT        | Members of the group                     |
| `groups`                 | INSERT/UPDATE | Owner (`owner_user_id = auth.uid()`)     |
| `group_members`          | SELECT        | Members of the same group                |
| `group_members`          | INSERT        | Group owner                              |
| `expenses`               | SELECT/INSERT | Members of the group                     |
| `expense_payers`         | SELECT/INSERT | Members of the group                     |
| `expense_participants`   | SELECT/INSERT | Members of the group                     |
| `payments`               | SELECT/INSERT | Members of the group                     |
| `user_payment_profiles`  | SELECT/UPDATE | Own row only                             |

## Key DB Functions

| Function                       | Type                    | Purpose                                       |
|--------------------------------|-------------------------|-----------------------------------------------|
| `public.is_admin()`            | `SECURITY DEFINER`      | Returns `true` if caller has `role = 'admin'` |
| `public.handle_new_user()`     | `SECURITY DEFINER` trig | Auto-inserts `profiles` row on signup         |
| `public.prevent_role_escalation()` | `SECURITY DEFINER` trig | Blocks non-admin role changes at DB level |

## Push Delivery (migrations `20260612020000`, `20260909120000`)

- Triggers on `expenses` (insert), `payments` (pending insert, pending→paid update) call `settleup.notify_push_event()`, a `SECURITY DEFINER` trigger function. It is a no-op until `settleup.app_config` holds `push_webhook_url` and `push_webhook_secret` (table has RLS and no policies: owner SQL only).
- `settleup.build_push_messages(event, row)` resolves recipients (linked, non-departed members; the creator is excluded for expenses; the creditor for pending payments; the payer for confirmations) and their `push_tokens`, and returns finished Expo messages: group name as title, short body, `data: { group_id, event, route }`. Not client-callable.
- The trigger posts `{ messages }` via `pg_net` to the `send-push` Edge Function, which holds **no service-role key**: it verifies `x-push-secret`, forwards to Expo, and prunes `DeviceNotRegistered` tokens through `settleup.prune_push_tokens(secret, tokens)` (anon-executable, secret-guarded, max 500). Runbook: `supabase/functions/send-push/README.md`.
- `push_tokens` is owner-RLS; mobile registers/rotates its own row (`apps/mobile/src/services/push.ts`).

## Product Events (migration `20260909130000`)

- `settleup.product_events(id, event_name, occurred_at, user_id, platform, properties)` holds the sixteen PRD 12.4 events. `settleup.product_event_spec(name)` is the allowlist of enumerated property keys and values; a CHECK constraint rejects anything else, so no free text can be stored. The shared `PRODUCT_EVENT_SPEC` in `packages/shared/src/analytics` must match it (a shared test parses the migration and compares).
- Signed-in clients insert their own rows (`user_id = auth.uid()`, per-column INSERT grant, no update/delete). Only `public.is_admin()` can read. Account closure detaches `user_id`; global Auth deletion sets it null.
- Public pages record through `settleup.track_public_event(share_token, name, properties)`: three public events only, resolved to a member or group id and limited to 60 per five minutes per id (`product_event_limits`). A null token records only an invalid-link open against a sentinel key.
- Server-derived events: `account_created` (trigger on `auth.users` insert) and `group_settled` (trigger after a payment becomes PAID and every member balance is zero, recorded once per ledger state via `group_settlements`). When the deferred currency migration is activated, `record_group_settled()` must compare balances per currency.

## SQL Tests

`supabase/tests/*.sql` are transactional (`BEGIN … ROLLBACK`) and assert with `ASSERT`/`RAISE`. CI runs them against a local Supabase with every migration applied (`db-tests` job in `.github/workflows/ci.yml`). Locally:

```bash
supabase start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector,realtime,storage-api,supavisor
for f in supabase/tests/*.sql; do psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f "$f"; done
```

Files: `launch_security.sql` (invitations, guest reports, resolution authorization), `public_payloads.sql` (public payload allowlists, rotation, anonymous access to private RPCs), `account_closure.sql`, `currency_ledger.sql`, `push_delivery.sql`, `product_events.sql`.

## Currency Migration Status

`20260908163441_currency_ledger.sql` adds `currency_code` columns, versioned `_v2` RPCs, the `x-ledger-version: 2` header gate and `PT426` rejection for legacy RPCs on non-PHP ledgers. It is **applied locally and in CI but intentionally not applied to the shared remote project** (launch decision D1: PHP-only beta). Clients call only legacy RPCs and default absent codes to PHP, so they work either way as long as all data stays PHP.

## Regenerating Types After Schema Changes

```bash
# Local
pnpm supabase gen types typescript --local \
  > packages/supabase/src/database.types.ts

# Remote (linked project)
pnpm supabase gen types typescript --linked \
  > packages/supabase/src/database.types.ts
```

Commit the updated `database.types.ts`. All apps pick up changes automatically.
