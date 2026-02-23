# 00 — Overview

## What is this?

A production-ready SaaS monorepo starter. Clone it, rename packages, and ship.

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Web         | Next.js 15 (App Router, TypeScript) |
| Mobile      | Expo SDK 52 / React Native 0.76     |
| Auth & DB   | Supabase (Postgres + RLS)           |
| Storage     | Supabase Storage                    |
| Monorepo    | Turborepo + pnpm workspaces         |
| Type Safety | TypeScript 5.6, Zod                 |
| Linting     | ESLint 8, Prettier 3                |

## Repository Layout

```
prototype-template/
├── apps/
│   ├── web/          Next.js web app
│   └── mobile/       Expo React Native app
├── packages/
│   ├── ui/           Shared React web components
│   ├── shared/       Types, Zod schemas, constants (platform-agnostic)
│   └── supabase/     Supabase client factories (browser / server / mobile)
├── supabase/
│   ├── config.toml   Local Supabase configuration
│   ├── seed.sql      Development seed data
│   └── migrations/   Versioned SQL migrations
└── docs/
    └── brain/        Architecture decision records
```

## Key Principles

1. **No separate backend.** Supabase handles auth, database, storage, and edge functions.
2. **Type safety end-to-end.** Database types generated from Supabase → shared across all apps.
3. **Shared logic, separate UI.** `packages/shared` is used by both web and mobile. `packages/ui` is web-only.
4. **RLS everywhere.** All tables have Row Level Security enabled from day one.
5. **Env var discipline.** Public vars are prefixed (`NEXT_PUBLIC_`, `EXPO_PUBLIC_`). Secrets never reach the client.
