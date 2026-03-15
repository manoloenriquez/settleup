# CLAUDE.md — Monorepo AI Context

This file is authoritative context for Claude Code. Follow these rules strictly.

## Deep Context (read when needed)

- `docs/brain/00-overview.md` — project overview, features, user flows
- `docs/brain/01-architecture.md` — data flow, AI layer, env vars
- `docs/brain/02-conventions.md` — naming, file placement, how to add a feature
- `docs/brain/03-supabase.md` — schema reference, RLS policies, RPCs, migrations

---

## Tech Stack

Next.js 15 (App Router) · React 19 · Expo 54 · Supabase (Postgres + Auth + Storage) · TypeScript 5.9 · Zod 4 · Tailwind 4 · Vitest 3.2 · Turborepo 2.8 · pnpm 9.15

---

## Architecture

```
apps/
  web/          Next.js 15 App Router (TypeScript)
  mobile/       Expo 54 + Expo Router v6 (TypeScript)
packages/
  ui/           Unstyled shared React components (web-only)
  shared/       Types, Zod schemas, constants (platform-agnostic)
  supabase/     Typed DB client factories + database.types.ts
supabase/
  migrations/   SQL migration files (never edit existing migrations)
```

**Invariants:**
- `packages/shared` must not import from `apps/*` or other `packages/*`
- `packages/supabase` must not import from `apps/*`
- `SERVICE_ROLE_KEY` must never be imported in application code — guards use the user's JWT
- All DB mutations go through Supabase RLS — never bypass with service role

---

## Common Commands

| Task | Command |
|------|---------|
| Dev (all) | `pnpm dev` |
| Dev (web) | `pnpm dev:web` |
| Build | `pnpm build` |
| Lint | `pnpm lint` |
| Type check | `pnpm typecheck` |
| Test (shared) | `pnpm --filter @template/shared test` |
| New migration | `supabase/migrations/YYYYMMDDHHMMSS_description.sql` |
| Regen DB types | `pnpm supabase gen types typescript --local > packages/supabase/src/database.types.ts` |

---

## Core Rules

**TypeScript:** `strict: true`, `noUncheckedIndexedAccess: true`; explicit return types on all exports; no `any`; prefer `type` over `interface`.

**React (Web):** Server Components by default; `"use client"` only for event handlers/hooks/browser APIs; no `useEffect` for data; mutations via Server Actions + `useTransition`; call `router.refresh()` after mutations.

**Server Actions:** `assertAuth()` → Zod validate → DB call → return `ApiResponse<T>`. Never throw to client.

```ts
type ApiResponse<T> = { data: T; error: null } | { data: null; error: string };
```

**Supabase:** RLS on every table; write RLS policy before application code; never edit applied migrations — write a new one; migrations named `YYYYMMDDHHMMSS_description.sql`.

**Security:** No `SUPABASE_SERVICE_ROLE_KEY` in app code; validate MIME type + size before Storage uploads; only `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` vars in client bundles.

**AI:** `generateJSON<T>()` in `apps/web/src/lib/ai/` — validate all output with Zod; rate limit per user; AI never writes to DB directly; handle `LLM_ENABLED=false` gracefully.

---

## How to Work

1. **Read before writing** — scan relevant files before making changes
2. **Smallest correct change** — no unnecessary refactors or unrelated cleanups
3. **Verify** — `pnpm --filter @template/shared test` and `pnpm --filter @template/web build`
4. **Update docs** when introducing new patterns or conventions

---

## Output Format

- **Summary** — 2-3 sentences on what changed and why
- **Files changed** — list of modified/created files
- **How to test** — commands to verify
- **Risk notes** — anything that could break (if applicable)

---

## Definition of Done

- [ ] RLS policies exist for user and admin roles
- [ ] No `service_role` key in application code
- [ ] All Server Actions return `ApiResponse<T>`, never throw
- [ ] New tables/columns reflected in `database.types.ts`
- [ ] Zod validation in all Server Actions before DB ops
- [ ] No `any` types introduced
- [ ] `"use client"` only where strictly necessary
- [ ] Protected routes guarded in `middleware.ts` (web) and `RouteGuard` (mobile)
- [ ] `router.refresh()` called after all client mutations (web)
- [ ] New routes added to `ROUTES` constants if used in more than one place
- [ ] No secrets in client bundles
- [ ] Migration named `YYYYMMDDHHMMSS_description.sql`, no edits to prior migrations
- [ ] Shared tests pass: `pnpm --filter @template/shared test`
- [ ] Web build passes: `pnpm --filter @template/web build`
