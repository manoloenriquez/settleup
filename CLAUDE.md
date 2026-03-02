# CLAUDE.md — Monorepo AI Context

This file is authoritative context for AI agents working in this codebase.
Follow these rules strictly. Never deviate without explicit user instruction.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Web framework | Next.js (App Router) | 15.2 |
| React | React | 19 |
| Mobile framework | Expo + Expo Router | 54 / v6 |
| Backend / DB | Supabase (Postgres + Auth + Storage) | JS SDK 2.97 |
| Language | TypeScript | 5.9 |
| Validation | Zod | 4 |
| Styling (web) | Tailwind CSS | 4 |
| Testing | Vitest | 3.2 |
| Monorepo | Turborepo | 2.8 |
| Package manager | pnpm | 9.15 |

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
- Server secrets (`SERVICE_ROLE_KEY`) must never be imported in `apps/web/src/app` server components or actions — they never need it; guards use the user's own JWT
- All database mutations go through Supabase RLS — never bypass with service role from application code

---

## Common Commands

| Task | Command |
|------|---------|
| Dev (all) | `pnpm dev` |
| Dev (web only) | `pnpm dev:web` |
| Dev (mobile only) | `pnpm dev:mobile` |
| Build | `pnpm build` |
| Lint | `pnpm lint` |
| Type check | `pnpm typecheck` |
| Test | `pnpm test` |
| Test (shared only) | `pnpm --filter @template/shared test` |
| Format | `pnpm format` |
| New migration | Create file: `supabase/migrations/YYYYMMDDHHMMSS_description.sql` |
| Regen DB types | `pnpm supabase gen types typescript --local > packages/supabase/src/database.types.ts` |

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

## AI Layer (Web)

Provider-abstracted LLM integration in `apps/web/src/lib/ai/`.

- **`generateJSON<T>()`** — takes `{ system, prompt, schema, userId }`, returns `ApiResponse<T>`
- **Providers:** Ollama (default), OpenAI (optional) — selected via `LLM_PROVIDER` env var
- **Rate limiting:** In-memory per-userId, configurable via `AI_LIMITS.RATE_LIMIT_PER_MINUTE`
- **Validation:** All LLM output is parsed as JSON then validated with the caller's Zod schema
- **Graceful degradation:** When `LLM_ENABLED=false`, `generateJSON` returns an error response — features must handle this
- **AI never writes to DB** — produces drafts/suggestions that the user confirms before persistence
- **Feature modules:** `receipt.ts` (OCR → expense), `smart-split.ts`, `insights.ts`, `conversation.ts`

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

## Security Rules

- **Service role key:** Never import `SUPABASE_SERVICE_ROLE_KEY` in application code (server actions, server components). Guards use the user's own JWT.
- **File uploads:** Validate MIME type + file size before writing to Supabase Storage
- **Public share endpoints:** Expose minimal data through anon-safe `SECURITY DEFINER` RPCs only
- **AI/LLM:** Validate all output with Zod, rate limit per user, never write raw LLM text directly to DB
- **Client bundles:** Only `NEXT_PUBLIC_*` (web) and `EXPO_PUBLIC_*` (mobile) env vars may be exposed to the client

---

## File Placement

| What                                   | Where                                       |
| -------------------------------------- | ------------------------------------------- |
| Shared types / utility types           | `packages/shared/src/types/index.ts`        |
| Zod schemas                            | `packages/shared/src/schemas/index.ts`      |
| App-wide constants, route strings      | `packages/shared/src/constants/index.ts`    |
| DB-generated / hand-typed DB types     | `packages/supabase/src/database.types.ts`   |
| Supabase client factories              | `packages/supabase/src/`                    |
| Web server-side Supabase helpers       | `apps/web/src/lib/supabase/`                |
| Web AI / LLM provider abstraction      | `apps/web/src/lib/ai/`                      |
| Web server actions                     | `apps/web/src/app/actions/<domain>.ts`      |
| Web UI components (no auth/data logic) | `apps/web/src/components/ui/`               |
| Web feature components                 | `apps/web/src/components/<feature>/`        |
| Web route layouts                      | `apps/web/src/app/(group)/layout.tsx`       |
| Web route pages                        | `apps/web/src/app/(group)/<route>/page.tsx` |
| Mobile auth context                    | `apps/mobile/src/context/AuthContext.tsx`   |
| Mobile Supabase client                 | `apps/mobile/src/lib/supabase.ts`           |
| Mobile UI components                   | `apps/mobile/src/components/ui/`            |
| Mobile screens                         | `apps/mobile/app/(group)/<screen>.tsx`      |
| DB migrations                          | `supabase/migrations/`                      |

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

## How to Work in This Repo

Quality rules for agents working in this codebase:

1. **Read before writing** — scan relevant files before making changes
2. **Smallest correct change** — avoid unnecessary refactors, extra abstractions, or unrelated cleanups
3. **Verify your work** — run `pnpm --filter @template/shared test` and `pnpm --filter @template/web build` after changes
4. **Update docs** when introducing new patterns or conventions
5. **Avoid new dependencies** unless clearly justified and discussed
6. **UI rules:** clear primary CTA per screen, good empty states, consistent spacing, accessible labels
7. **When touching AI:** never let AI write to DB directly, strict Zod validation on all output, graceful fallbacks when LLM is disabled

---

## Output Format

For non-trivial tasks, deliver:

- **Summary** — 2-3 sentences describing what changed and why
- **Files changed** — list of modified/created files
- **How to test** — commands to verify the change
- **Risk notes** — anything that could break or needs rollout attention (if applicable)

---

## Testing

- **Framework:** Vitest 3.2
- **Test location:** `packages/shared/src/__tests__/`
- **Run all tests:** `pnpm test` (root) or `pnpm --filter @template/shared test`
- **Convention:** Add tests when changing shared utils, schemas, or pure functions
- **Test files:** `money.test.ts`, `split.test.ts`, `parser.test.ts`, `debts.test.ts`

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
- [ ] Shared tests pass: `pnpm --filter @template/shared test`
- [ ] Web build passes: `pnpm --filter @template/web build`

---

## Environment Variables

### Web (`apps/web/.env.local`)

| Variable | Public/Secret | Purpose |
|----------|--------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anonymous key |
| `NEXT_PUBLIC_APP_URL` | Public | App base URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Admin-only Supabase key (never use in app code) |
| `LLM_ENABLED` | Secret | Enable/disable AI features (`true`/`false`) |
| `LLM_PROVIDER` | Secret | LLM provider: `ollama` (default) or `openai` |
| `OLLAMA_BASE_URL` | Secret | Ollama server URL (default: `http://localhost:11434`) |
| `OLLAMA_MODEL` | Secret | Ollama model name (default: `llama3.2`) |
| `OPENAI_API_KEY` | Secret | OpenAI API key (required if provider is `openai`) |
| `OPENAI_MODEL` | Secret | OpenAI model name (default: `gpt-4o-mini`) |

### Mobile (`apps/mobile/.env`)

| Variable | Public/Secret | Purpose |
|----------|--------------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anonymous key |
| `EXPO_PUBLIC_APP_NAME` | Public | App display name |
