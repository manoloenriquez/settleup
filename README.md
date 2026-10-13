# Talli

Track what you spend and split shared costs fairly — on iPhone and on the web.
**Next.js 15 · Expo 54 · Supabase · Turborepo · pnpm**

> Talli was previously developed as *SettleUp* (and briefly *Tabkind*). Some
> internal identifiers keep the old name on purpose — the Postgres schema
> `settleup`, storage keys, URL schemes, the EAS slug. See
> [`docs/brand/REBRAND.md`](./docs/brand/REBRAND.md) before renaming anything.

---

## What it does

| | iPhone app (`apps/mobile`) | Web app (`apps/web`) |
|---|---|---|
| Personal spending and adaptive budget | Yes, also without an account | Not yet |
| Groups, friends, splits, balances, settle up | Yes (signed in) | Groups yes; friends can be accepted, not created |
| Shareable balance links for people without Talli | Creates them | Hosts them (`/g`, `/p`, `/f`) |
| Payment details (GCash, bank, QR), opt-in on links | Yes | Yes |
| Talli Assistant, receipt reading | On-device Apple Intelligence (iOS 27) | Receipt OCR and keyword entry; no cloud AI |
| Offline changes | Outbox | Outbox + installable PWA |

The full feature-by-feature comparison and roadmap is in
[`docs/parity/PARITY_AUDIT.md`](./docs/parity/PARITY_AUDIT.md).

Share links (`/p/<token>`, `/g/<token>`) are served by `SECURITY DEFINER` RPCs
callable with the anon key; payment details appear on them only when their owner
opts in.

### Run the tests

```bash
pnpm --filter @template/shared test
# or from root:
pnpm test
```

### Dev seed data

Sign in to the web app, open any group, and click **Load Demo Data** (development
only).

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
# First-time iOS setup for native modules / dev client
pnpm dev:mobile:ios

# Then start Metro for the development build
pnpm dev:mobile
# Starts Expo for the development client
# For iOS simulator: press i
# For Android emulator: press a
# For Expo Go specifically: pnpm --filter @template/mobile start:expo-go
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
│   ├── web/               Next.js 15 (App Router), installable PWA
│   ├── mobile/            Expo 54 (React Native), iOS 27
│   └── api/               Hono server: account deletion only
├── packages/
│   ├── ui/                Shared web UI components
│   ├── shared/            Types, Zod schemas, constants
│   └── supabase/          Supabase client factories
├── supabase/
│   ├── config.toml        Local stack configuration
│   ├── seed.sql           Dev seed data
│   └── migrations/        SQL migration files
└── docs/                  brain/ (architecture), parity/, brand/, budgeting/, ai/, launch/
```

---

## Environment Variables

### Web (`apps/web/.env.local`)

```bash
NEXT_PUBLIC_SUPABASE_URL=...        # from `supabase start` output
NEXT_PUBLIC_SUPABASE_ANON_KEY=...   # from `supabase start` output
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Mobile (`apps/mobile/.env.local`)

```bash
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

> `NEXT_PUBLIC_` and `EXPO_PUBLIC_` vars are bundled into the client.
> Never put the service-role key in the web or mobile app; the only allowed use
> is the account-deletion route in `apps/api`.

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
