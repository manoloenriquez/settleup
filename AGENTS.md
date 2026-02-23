# AGENTS.md — Monorepo AI Context

This file is authoritative context for AI agents working in this codebase.
Follow these rules strictly. Never deviate without explicit user instruction.

---

## Architecture

```
apps/
  web/          Next.js 15 App Router (TypeScript)
  mobile/       Expo 52 + Expo Router v4 (TypeScript)
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
- Server secrets (`SERVICE_ROLE_KEY`) must never be imported in `apps/web/src/app` server components or actions — they never need it; guards use the user's own JWT
- All database mutations go through Supabase RLS — never bypass with service role from application code

---

## Coding Conventions

### TypeScript
- `strict: true` and `noUncheckedIndexedAccess: true` — no casting away errors
- All exported functions must have explicit return types
- Prefer `type` over `interface`; use `interface` only for extension hierarchies
- No `any` — use `unknown` + type narrowing

### React (Web — Next.js)
- Server Components are the default; add `"use client"` only when required (event handlers, hooks, browser APIs)
- Data fetching lives in Server Components or Server Actions — never `useEffect` for data
- Use `React.cache()` to deduplicate identical DB calls within a single request
- Mutations use Server Actions (`"use server"`) + `useTransition` on the client
- All Server Actions return `ApiResponse<T>` — never throw to the client
- After client-initiated mutations, call `router.refresh()` to re-run server components

### React (Mobile — Expo)
- File-based routing via Expo Router; route groups: `(auth)` and `(protected)`
- Auth state managed exclusively via `onAuthStateChange` — do not call `getSession()` alongside it
- Platform detection: `Platform.OS === "web"` (never `typeof window`)
- Session persisted via `expo-secure-store` (iOS/Android) / AsyncStorage (web)

### Server Actions (Web)
```ts
"use server";
// 1. assertAuth() or assertAdmin() — throws AuthError which Next.js catches
// 2. Validate with Zod
// 3. DB call via createServerClient(cookieAdapter)
// 4. Return ApiResponse<T>
```

### Shared `ApiResponse<T>` type
```ts
type ApiResponse<T> = { data: T; error: null } | { data: null; error: string };
```
Used for all Server Action return values and mobile auth context methods.

---

## Supabase Rules (RLS-First)

1. **Enable RLS on every table** — no exceptions
2. **Write the RLS policy before writing application code** that touches that table
3. `is_admin()` is a `SECURITY DEFINER` function — do not inline admin checks in policies (causes recursion)
4. Triggers use `SECURITY DEFINER` for defence-in-depth (e.g. `prevent_role_escalation`)
5. Never add a `BYPASSRLS` role to application credentials
6. New migrations go in `supabase/migrations/` with filename `YYYYMMDDHHMMSS_description.sql`
7. Never edit an already-applied migration — write a new one
8. All `INSERT` triggers that auto-populate data (e.g. `handle_new_user`) must be `SECURITY DEFINER` and have `SET search_path = public`

---

## File Placement

| What | Where |
|---|---|
| Shared types / utility types | `packages/shared/src/types/index.ts` |
| Zod schemas | `packages/shared/src/schemas/index.ts` |
| App-wide constants, route strings | `packages/shared/src/constants/index.ts` |
| DB-generated / hand-typed DB types | `packages/supabase/src/database.types.ts` |
| Supabase client factories | `packages/supabase/src/` |
| Web server-side Supabase helpers | `apps/web/src/lib/supabase/` |
| Web server actions | `apps/web/src/app/actions/<domain>.ts` |
| Web UI components (no auth/data logic) | `apps/web/src/components/ui/` |
| Web feature components | `apps/web/src/components/<feature>/` |
| Web route layouts | `apps/web/src/app/(group)/layout.tsx` |
| Web route pages | `apps/web/src/app/(group)/<route>/page.tsx` |
| Mobile auth context | `apps/mobile/src/context/AuthContext.tsx` |
| Mobile Supabase client | `apps/mobile/src/lib/supabase.ts` |
| Mobile UI components | `apps/mobile/src/components/ui/` |
| Mobile screens | `apps/mobile/app/(group)/<screen>.tsx` |
| DB migrations | `supabase/migrations/` |

---

## How to Add a New Feature

1. **Schema first** — write a new migration in `supabase/migrations/` with RLS policies
2. **Types** — update `packages/supabase/src/database.types.ts` to match
3. **Server Actions (web)** — add `apps/web/src/app/actions/<domain>.ts`; validate with Zod; return `ApiResponse<T>`
4. **Route guard** — if the route is protected or admin-only, add it to `apps/web/src/middleware.ts` matcher and use `requireAuth()`/`requireAdmin()` in the layout or page
5. **UI** — Server Component for data display, `"use client"` component for interactive mutations; call `router.refresh()` after mutations
6. **Mobile (if applicable)** — add methods to `AuthContext` or create a new hook; screen in `app/(protected)/`
7. **Shared constants** — add new route strings to `ROUTES` in `packages/shared/src/constants/index.ts`

---

## Definition of Done

Before marking any feature complete, verify:

- [ ] RLS policies exist and are tested for both the user and admin roles
- [ ] No `service_role` key used in application code
- [ ] All Server Actions return `ApiResponse<T>`, never throw to the client
- [ ] New tables/columns are reflected in `database.types.ts`
- [ ] Zod validation in all Server Actions before DB operations
- [ ] No `any` types introduced
- [ ] `"use client"` only where strictly necessary
- [ ] Protected routes guarded in both `middleware.ts` (web) and `RouteGuard` (mobile)
- [ ] `router.refresh()` called after all client-side mutations (web)
- [ ] New routes added to `ROUTES` constants if referenced in more than one place
- [ ] No secrets in client bundles (`NEXT_PUBLIC_*` only for public keys)
- [ ] Migration file named `YYYYMMDDHHMMSS_description.sql`, no edits to prior migrations
