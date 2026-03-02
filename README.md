# SettleUp Lite

Group expense tracker — split bills with friends, no login required for friends.
**Next.js 15 · Expo 54 · Supabase · Turborepo · pnpm**

---

## Features

- Create expense groups and add members
- Add expenses (form or natural-language chat input)
- Equal split with correct remainder distribution
- Token-based shareable friend links — friends see their balance without logging in (`/p/<token>`)
- GCash + bank payment profile with QR image upload
- Mark paid / undo last payment
- Groupchat-ready copy message format
- Mobile app (Expo) with group list, balances, and expense entry

---

## SettleUp Lite — Setup Notes

### Apply the migration

```bash
pnpm supabase start
pnpm supabase db push       # or: pnpm supabase db reset
```

### Regenerate TypeScript types (after any schema change)

```bash
pnpm supabase gen types typescript --local \
  > packages/supabase/src/database.types.ts
```

### Run tests

```bash
pnpm --filter @template/shared test
# or from root:
pnpm test
```

### Dev seed data

Sign in to the web app, navigate to any group, and click **Load Demo Data** (visible in `development` only). Creates a demo group "Barkada Trip 2025" with 7 members and 3 expenses.

### Friend links

Every group member gets a unique Base62 share token (22 chars for newly created members). Their personal link is:

```
https://<your-domain>/p/<share_token>
```

No authentication required — served by the `get_friend_view` Postgres RPC (SECURITY DEFINER, callable with anon key).

### Copy message format

```
FINAL AMOUNTS TO PAY (TO [PAYER_NAME])
[Name 1] — ₱x,xxx.xx
[Name 2] — ₱x,xxx.xx
TOTAL: ₱xx,xxx.xx
```

Individual:
```
Hi [Name]! You owe ₱x,xxx.xx for [Group Name].
Pay via GCash: [number] ([name])
Or bank: [bank] [acct]
Link: /p/[token]
```

---

## Next Improvements

- OCR expense parsing (photo of receipt → auto-fill)
- Unequal splits (custom amounts or percentages)
- Share-link rate limiting and token rotation UX
- Payment reminders (push notifications / SMS)
- Analytics dashboard (total spent per member, per category)
- Share token rotation (invalidate old links)
- Group invite codes for co-owners

---

---

## Prerequisites

| Tool           | Version  | Install                                  |
|----------------|----------|------------------------------------------|
| Node.js        | ≥ 20     | [nodejs.org](https://nodejs.org)         |
| pnpm           | ≥ 9      | `npm i -g pnpm`                          |
| Supabase CLI   | latest   | `brew install supabase/tap/supabase`     |
| Docker Desktop | latest   | [docker.com](https://www.docker.com)     |

---

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url> my-app
cd my-app
pnpm install

# 2. Copy env files
cp apps/web/.env.example    apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env.local

# 3. Start local Supabase (Docker required)
pnpm supabase start
pnpm supabase db reset      # applies migrations + seed

# 4. Paste the local Supabase URL + anon key into .env.local files
#    (printed by `supabase start`)

# 5. Run everything
pnpm dev
```

---

## Running Individual Apps

### Web (Next.js)

```bash
pnpm dev:web
# → http://localhost:3000
```

### Mobile (Expo)

```bash
pnpm dev:mobile
# Opens Expo Go / simulator selector
# For iOS simulator: press i
# For Android emulator: press a
# For physical device: scan QR with Expo Go
```

### Supabase Local Stack

```bash
# Start (Docker required)
pnpm supabase start

# Stop
pnpm supabase stop

# Reset DB (re-applies all migrations + seed.sql)
pnpm supabase db reset

# Open Studio
open http://localhost:54323
```

---

## Useful Commands

```bash
# Build all packages and apps
pnpm build

# Lint everything
pnpm lint

# Type-check everything
pnpm typecheck

# Format all files
pnpm format

# Create a new Supabase migration
pnpm supabase migration new <name>

# Regenerate TypeScript types from local DB
pnpm supabase gen types typescript --local \
  > packages/supabase/src/database.types.ts
```

---

## Project Structure

```
.
├── apps/
│   ├── web/               Next.js 15 (App Router)
│   └── mobile/            Expo 54 (React Native)
├── packages/
│   ├── ui/                Shared web UI components
│   ├── shared/            Types, Zod schemas, constants
│   └── supabase/          Supabase client factories
├── supabase/
│   ├── config.toml        Local stack configuration
│   ├── seed.sql           Dev seed data
│   └── migrations/        SQL migration files
└── docs/brain/            Architecture decision records
```

---

## Environment Variables

### Web (`apps/web/.env.local`)

```bash
NEXT_PUBLIC_SUPABASE_URL=...        # from `supabase start` output
NEXT_PUBLIC_SUPABASE_ANON_KEY=...   # from `supabase start` output
SUPABASE_SERVICE_ROLE_KEY=...       # server-only — never expose to client
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Mobile (`apps/mobile/.env.local`)

```bash
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

> `NEXT_PUBLIC_` and `EXPO_PUBLIC_` vars are bundled into the client.
> Keep secrets (service role key) server-side only.

---

## Deploying

### Web → Vercel

```bash
# Link and deploy
pnpm dlx vercel --cwd apps/web
```

Set the same env vars in the Vercel dashboard. Set the root directory to `apps/web` if using monorepo preset.

### Mobile → EAS Build

```bash
pnpm dlx eas-cli build --platform all --profile production
```

### Supabase → Production

```bash
# Link to your Supabase project
pnpm supabase link --project-ref <your-project-ref>

# Push migrations
pnpm supabase db push
```

---

## Docs

See [`docs/brain/`](./docs/brain/) for architecture decisions and conventions:

- [00 — Overview](./docs/brain/00-overview.md)
- [01 — Architecture](./docs/brain/01-architecture.md)
- [02 — Conventions](./docs/brain/02-conventions.md)
- [03 — Supabase](./docs/brain/03-supabase.md)
