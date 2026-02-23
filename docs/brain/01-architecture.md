# 01 — Architecture

## Package Graph

```
apps/web   ──┐
              ├──▶ @template/ui        (web components)
              ├──▶ @template/shared    (types, schemas, constants)
              └──▶ @template/supabase  (browser + server clients)

apps/mobile ─┐
              ├──▶ @template/shared    (types, schemas, constants)
              └──▶ @template/supabase  (mobile client)
```

`packages/ui` is **web-only** (DOM). Mobile uses React Native built-ins.

## Supabase Client Strategy

| Context                          | Client                                      | Module                         |
|----------------------------------|---------------------------------------------|--------------------------------|
| Next.js Client Component         | `createBrowserClient()` → singleton         | `@template/supabase/browser`   |
| Next.js Server Component / Action | `createServerClient(cookieAdapter)`        | `@template/supabase/server`    |
| Next.js Middleware               | Inline via `@supabase/ssr`                  | `apps/web/src/middleware.ts`   |
| Expo React Native                | `createMobileClient({ storage })`           | `@template/supabase/mobile`    |

## Auth Flow (Web)

```
Browser Request
    │
    ▼
middleware.ts          ← refreshes session cookie on every request
    │
    ▼
Server Component       ← reads session via createServerClient()
    │
    ▼
Supabase RLS           ← enforces auth.uid() policies at DB level
```

## Data Flow

```
Client ──▶ Supabase JS SDK ──▶ PostgREST ──▶ Postgres (RLS)
                          ──▶ Auth API
                          ──▶ Storage API
```

No custom REST/GraphQL layer. All queries go directly to Supabase.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL          client-safe
NEXT_PUBLIC_SUPABASE_ANON_KEY     client-safe (RLS enforced)
SUPABASE_SERVICE_ROLE_KEY         server-only — bypasses RLS

EXPO_PUBLIC_SUPABASE_URL          bundled into app binary
EXPO_PUBLIC_SUPABASE_ANON_KEY     bundled into app binary
```

> Never put `SUPABASE_SERVICE_ROLE_KEY` in client-side or mobile code.

## Turborepo Pipeline

```
build  ──▶ depends on ^build (packages must build before apps)
dev    ──▶ persistent, no cache
lint   ──▶ parallel across all packages
typecheck ──▶ parallel, depends on ^typecheck
```
