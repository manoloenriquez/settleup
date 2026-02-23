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
pnpm supabase migration new <name>
# e.g.: pnpm supabase migration new add_posts_table
```

This creates `supabase/migrations/<timestamp>_<name>.sql`. Write your DDL there.

Apply locally:

```bash
pnpm supabase db reset        # reset + re-apply all migrations + seed
# or
pnpm supabase db push         # apply pending migrations without resetting
```

Push to remote (production):

```bash
pnpm supabase db push --linked
```

## Row Level Security

**Every table must have RLS enabled.** Never disable it.

Template for a user-owned table:

```sql
-- Enable RLS
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- Owner can do anything
CREATE POLICY "owner_all" ON public.posts
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Authenticated users can read published posts
CREATE POLICY "read_published" ON public.posts FOR SELECT
  USING (published = true AND auth.role() = 'authenticated');
```

## Auth

Supabase Auth is configured in `supabase/config.toml`. Key settings:

- `enable_confirmations = false` in dev (set `true` in production)
- Social providers configured in `[auth.external.*]` blocks
- JWT expiry: 1 hour with refresh token rotation enabled

### Web: using auth in Server Actions

```ts
import { createClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
```

### Mobile: using auth in components

```ts
import { supabase } from "@/lib/supabase";

const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password,
});
```

## Storage

Buckets are created via migrations or the Studio. Example:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true);

-- RLS on objects
CREATE POLICY "owner upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "public read" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');
```

## Environment Variables

| Variable                       | Where used        | Notes                         |
|-------------------------------|-------------------|-------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`    | Web (client+server) | Safe to expose               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Web (client+server) | RLS enforced                |
| `SUPABASE_SERVICE_ROLE_KEY`   | Web (server only) | Bypasses RLS — keep secret   |
| `EXPO_PUBLIC_SUPABASE_URL`    | Mobile            | Bundled in binary             |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Mobile          | RLS enforced                  |

## Schema Reference

### `profiles`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, FK → `auth.users(id)` CASCADE |
| `email` | `text` | Copied from auth on signup via trigger |
| `full_name` | `text?` | Nullable |
| `role` | `user_role` | Enum: `user` \| `admin`. Default: `user` |
| `created_at` | `timestamptz` | Default: `NOW()` |

### `waitlist`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `email` | `text` | Unique |
| `approved` | `boolean` | Default: `false` |
| `approved_by` | `uuid?` | FK → `profiles(id)` SET NULL |
| `created_at` | `timestamptz` | Default: `NOW()` |

### RLS Summary
| Table | Operation | Who |
|---|---|---|
| `profiles` | SELECT | Own row **or** any admin |
| `profiles` | UPDATE | Own row (non-role fields) **or** any admin (any field) |
| `profiles` | INSERT | Trigger only (SECURITY DEFINER) |
| `profiles` | DELETE | Via `auth.users` cascade only |
| `waitlist` | INSERT | Anyone (anon + authenticated) |
| `waitlist` | SELECT / UPDATE / DELETE | Admins only |

### Key DB Functions
| Function | Type | Purpose |
|---|---|---|
| `public.is_admin()` | `SECURITY DEFINER` | Returns `true` if `auth.uid()` has `role = 'admin'`. Used in RLS policies. |
| `public.handle_new_user()` | `SECURITY DEFINER` trigger | Auto-inserts a `profiles` row on auth signup. |
| `public.prevent_role_escalation()` | `SECURITY DEFINER` trigger | Blocks non-admins from changing `role` field at the DB level. |

## Regenerating Types After Schema Changes

```bash
# Local
pnpm supabase gen types typescript --local \
  > packages/supabase/src/database.types.ts

# Remote (linked project)
pnpm supabase gen types typescript --linked \
  > packages/supabase/src/database.types.ts
```

Commit the updated `database.types.ts`. All apps and packages pick up the changes automatically.
