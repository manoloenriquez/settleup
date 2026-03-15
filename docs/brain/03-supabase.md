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
| `get_group_overview(p_share_token)`   | Anon     | Group-level overview via share token                |
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
