# 00 — Overview

## What is this?

**SettleUp Lite** — a group expense splitting app. Track shared expenses, calculate who owes whom, share payment info via public links, and use AI to parse receipts and suggest splits.

## Tech Stack

| Layer       | Technology                              | Version |
|-------------|-----------------------------------------|---------|
| Web         | Next.js (App Router, TypeScript)        | 15.2    |
| Mobile      | Expo + Expo Router                      | SDK 54 / v6 |
| Auth & DB   | Supabase (Postgres + RLS)               | JS SDK 2.97 |
| Storage     | Supabase Storage                        | —       |
| Monorepo    | Turborepo + pnpm workspaces             | 2.8 / 9.15 |
| Type Safety | TypeScript                              | 5.9     |
| Validation  | Zod                                     | 4       |
| Styling     | Tailwind CSS                            | 4       |
| Testing     | Vitest                                  | 3.2     |

## Repository Layout

```
settleup/
├── apps/
│   ├── web/          Next.js 15 App Router (TypeScript)
│   └── mobile/       Expo 54 + Expo Router v6 (TypeScript)
├── packages/
│   ├── ui/           Shared React web components (web-only)
│   ├── shared/       Types, Zod schemas, constants (platform-agnostic)
│   └── supabase/     Typed DB client factories + database.types.ts
├── supabase/
│   ├── config.toml   Local Supabase configuration
│   ├── seed.sql      Development seed data
│   └── migrations/   Versioned SQL migrations (never edit existing)
└── docs/
    └── brain/        Architecture decision records
```

## Core Features

- **Group expense tracking** — create groups, add members, record expenses with multi-payer support
- **Balance calculation** — `get_member_balances()` RPC with 4-source formula (paid - shares - received + sent)
- **Payment profiles** — per-user GCash / bank details with QR codes (`settleup.user_payment_profiles`)
- **Public share links** — members claim a `share_token` URL to view their balance without signing in
- **AI features** — receipt OCR → expense draft, smart splits, spending insights, natural language entry
- **Friend view** — anon-safe `get_friend_view()` RPC for public share pages

## Key Principles

1. **No separate backend.** Supabase handles auth, database, storage.
2. **Type safety end-to-end.** DB types generated from Supabase → shared across all apps.
3. **RLS everywhere.** Every table has Row Level Security enabled from day one.
4. **Env var discipline.** Public vars prefixed (`NEXT_PUBLIC_`, `EXPO_PUBLIC_`). Secrets never reach the client.
5. **AI never writes to DB directly.** LLM output produces drafts; user confirms before persistence.
6. **Money in integer cents.** Use `formatCents` / `parsePHPAmount` from `@template/shared`.
