# AGENTS.md — Agent Context for AI Agents

This file is authoritative context for AI agents working in this codebase.
Follow these rules strictly. Never deviate without explicit user instruction.

---

## Tech Stack

Next.js 15.2 (App Router) · React 19 · Expo 54 + Expo Router v6 · Supabase 2.97 · TypeScript 5.9 · Zod 4 · Tailwind 4 · Vitest 3.2 · Turborepo 2.8 · pnpm 9.15

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
  seed.sql      Dev seed data
  config.toml   Local Supabase config
```

**Invariants:**

- `packages/shared` must not import from any `apps/*` or other `packages/*`
- `packages/supabase` must not import from `apps/*`
- Server secrets (`SERVICE_ROLE_KEY`) must never be imported in server components or actions
- All database mutations go through Supabase RLS — never bypass with service role

---

## Rules

### TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true` — no casting away errors
- Explicit return types on all exported functions
- Prefer `type` over `interface`; no `any` — use `unknown` + narrowing

### Server Actions

```ts
"use server";
// 1. assertAuth() — throws AuthError
// 2. Validate with Zod
// 3. DB call via createServerClient(cookieAdapter)
// 4. Return ApiResponse<T>
```

`ApiResponse<T> = { data: T; error: null } | { data: null; error: string }`

### React (Web)

- Server Components by default; `"use client"` only for event handlers/hooks/browser APIs
- Data fetching in Server Components or Server Actions — never `useEffect` for data
- `React.cache()` to deduplicate identical DB calls within a request
- Mutations: Server Actions + `useTransition` + `router.refresh()` after success

### React (Mobile)

- File-based routing via Expo Router; route groups: `(auth)` and `(protected)`
- Auth via `onAuthStateChange` — never call `getSession()` alongside it
- Session: `expo-secure-store` (iOS/Android) / AsyncStorage (web)

### AI Layer

- Provider abstraction in `apps/web/src/lib/ai/`
- `generateJSON<T>()` — system + prompt + Zod schema → `ApiResponse<T>`
- AI never writes to DB — produces drafts, user confirms
- All LLM output validated with Zod before use
- Graceful degradation when `LLM_ENABLED=false`

### Supabase (RLS-First)

1. Enable RLS on every table
2. Write RLS policy before application code
3. `is_admin()` is `SECURITY DEFINER` — don't inline admin checks in policies
4. Triggers use `SECURITY DEFINER` with `SET search_path = public`
5. Never add `BYPASSRLS` to application credentials
6. Migrations: `supabase/migrations/YYYYMMDDHHMMSS_description.sql`
7. Never edit an already-applied migration

### Security

- Never ship `SUPABASE_SERVICE_ROLE_KEY` to client or use in app code
- Validate file uploads (MIME type + size) before storage
- Public share endpoints: minimal data, anon-safe RPCs only
- AI: validate all output with Zod, rate limit per user, no raw LLM text to DB
- Client bundles: only `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` env vars

---

## How to Work

1. **Inspect first** — use tools to read files and understand existing code before making changes
2. **Iterate in small commits** — one concern per commit, easy to review and revert
3. **Verify after each change** — run build, lint, and test commands
4. **When unsure, search the codebase** rather than guessing at types, imports, or patterns

---

## File Placement

| What                              | Where                                       |
| --------------------------------- | ------------------------------------------- |
| Shared types / utility types      | `packages/shared/src/types/index.ts`        |
| Zod schemas                       | `packages/shared/src/schemas/index.ts`      |
| App-wide constants, route strings | `packages/shared/src/constants/index.ts`    |
| DB types                          | `packages/supabase/src/database.types.ts`   |
| Supabase client factories         | `packages/supabase/src/`                    |
| Web Supabase helpers              | `apps/web/src/lib/supabase/`                |
| Web AI / LLM provider             | `apps/web/src/lib/ai/`                      |
| Web server actions                | `apps/web/src/app/actions/<domain>.ts`      |
| Web UI components                 | `apps/web/src/components/ui/`               |
| Web feature components            | `apps/web/src/components/<feature>/`        |
| Web route pages                   | `apps/web/src/app/(group)/<route>/page.tsx` |
| Mobile auth context               | `apps/mobile/src/context/AuthContext.tsx`   |
| Mobile Supabase client            | `apps/mobile/src/lib/supabase.ts`           |
| Mobile screens                    | `apps/mobile/app/(group)/<screen>.tsx`      |
| DB migrations                     | `supabase/migrations/`                      |

---

## Common Commands

| Task               | Command                               |
| ------------------ | ------------------------------------- |
| Dev (all)          | `pnpm dev`                            |
| Dev (web only)     | `pnpm dev:web`                        |
| Dev (mobile only)  | `pnpm dev:mobile`                     |
| Build              | `pnpm build`                          |
| Lint               | `pnpm lint`                           |
| Type check         | `pnpm typecheck`                      |
| Test               | `pnpm test`                           |
| Test (shared only) | `pnpm --filter @template/shared test` |
| Format             | `pnpm format`                         |

---

## Definition of Done

- [ ] RLS policies exist and are tested for user and admin roles
- [ ] No `service_role` key used in application code
- [ ] All Server Actions return `ApiResponse<T>`, never throw to client
- [ ] New tables/columns reflected in `database.types.ts`
- [ ] Zod validation in all Server Actions before DB operations
- [ ] No `any` types introduced
- [ ] `"use client"` only where strictly necessary
- [ ] Protected routes guarded in `middleware.ts` (web) and `RouteGuard` (mobile)
- [ ] `router.refresh()` called after all client-side mutations (web)
- [ ] No secrets in client bundles
- [ ] Migration named `YYYYMMDDHHMMSS_description.sql`, no edits to prior migrations
- [ ] Shared tests pass: `pnpm --filter @template/shared test`
- [ ] Web build passes: `pnpm --filter @template/web build`
