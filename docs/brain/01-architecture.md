# 01 — Architecture

## Package Graph

```
apps/web   ──┐
              ├──▶ @template/ui        (web components, DOM-only)
              ├──▶ @template/shared    (types, schemas, constants)
              └──▶ @template/supabase  (browser + server clients)

apps/mobile ─┐
              ├──▶ @template/shared    (types, schemas, constants)
              └──▶ @template/supabase  (mobile client)
```

**Package boundary rules:**
- `packages/shared` must not import from `apps/*` or other `packages/*`
- `packages/supabase` must not import from `apps/*`

## Supabase Client Strategy

| Context                            | Client                               | Module                       |
|------------------------------------|--------------------------------------|------------------------------|
| Next.js Client Component           | `createBrowserClient()` → singleton  | `@template/supabase/browser` |
| Next.js Server Component / Action  | `createServerClient(cookieAdapter)`  | `@template/supabase/server`  |
| Next.js Middleware                 | Inline via `@supabase/ssr`           | `apps/web/src/middleware.ts` |
| Expo React Native                  | `createMobileClient({ storage })`    | `@template/supabase/mobile`  |

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

Auth guards in Server Actions:
- `assertAuth()` — throws `AuthError` (caught by Next.js), used in actions
- `requireAuth()` — redirects to sign-in, used in page layouts

## SettleUp Data Flow

```
Expense Creation:
  Client form
    → Server Action (assertAuth → Zod → createServerClient)
    → INSERT settleup.expenses
    → INSERT settleup.expense_payers (who paid)
    → INSERT settleup.expense_participants (shares per member)
    → router.refresh()

Balance Calculation:
  Server Component
    → get_member_balances(p_group_id) RPC
    → Returns JSON: { member_id, net_cents, owed_cents, ... }
    → net = paid_as_payer - shares - received_payments + sent_payments

Friend/Share View (public, no auth):
  /p/[share_token] page
    → get_friend_view(p_share_token) SECURITY DEFINER RPC (anon key)
    → Returns minimal member balance + group name + payer payment info
```

## Offline & Sync

Both apps are offline-first for reads and for the core write flows (add
expense, settle up; mobile also edit/delete/comment). Queued writes replay
through the same RPCs with client-generated UUIDs as idempotency keys and an
`expected_updated_at` compare-and-swap guard on edits. Full design, server
contract, and the manual test matrix: `docs/brain/04-offline.md`.

## Product Analytics

First-party and privacy-minimal: `packages/shared/src/analytics` defines the
sixteen PRD 12.4 events as a typed union with enumerated properties, a
`Sink` interface and a fire-and-forget `createTracker`. Sinks:
`apps/web/src/lib/analytics/client.ts` (browser, lazy Supabase client),
`apps/web/src/lib/analytics/server.ts` (`trackServer` inside `after()` for
Server Actions; `trackPublic` for guest pages via the `track_public_event`
RPC), `apps/mobile/src/lib/analytics.ts`. Rows land in
`settleup.product_events`; the admin page lists the latest 100. No vendor is
wired; swap the sink to add one. Details: `docs/brain/03-supabase.md`.

## AI Layer

Every language-model feature runs on the iPhone with Apple Intelligence
(FoundationModels + Vision, iOS 27). No cloud AI provider exists in the
repository. Full design, availability handling, offline behaviour, device
requirements and the evaluation suite: `05-apple-intelligence.md`.

```
Receipt photo → Vision OCR rows → FoundationModels @Generable extraction
   → reconcileReceiptExtraction() (packages/shared, deterministic)
   → ReceiptReview (verified / likely / needs_review / missing per field)
   → review screen → existing expense RPCs
```

- Native code: `apps/mobile/modules/apple-intelligence/` (local Expo module).
- TypeScript layer: `apps/mobile/src/lib/ai/` (bridge, pure mappers, features).
- Web keeps deterministic helpers in `packages/ai` (Tesseract + regex receipt
  parse, keyword expense parser, equal split, computed insights). Android and
  ineligible iPhones use manual entry; the UI states why.

**AI never writes to DB.** All AI output is a draft that the user must confirm.

## Environment Variables

### Web (`apps/web/.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL          client-safe
NEXT_PUBLIC_SUPABASE_ANON_KEY     client-safe (RLS enforced)
NEXT_PUBLIC_APP_URL               client-safe

SUPABASE_SERVICE_ROLE_KEY         server-only — NEVER use in app code
```

No AI provider keys exist: language-model features run on-device.

### Mobile (`apps/mobile/.env`)

```
EXPO_PUBLIC_SUPABASE_URL          bundled into app binary
EXPO_PUBLIC_SUPABASE_ANON_KEY     bundled (RLS enforced)
EXPO_PUBLIC_APP_NAME              app display name
```

> Never put `SUPABASE_SERVICE_ROLE_KEY` in client-side or mobile code.

## Turborepo Pipeline

```
build     ──▶ depends on ^build (packages must build before apps)
dev       ──▶ persistent, no cache
lint      ──▶ parallel across all packages
typecheck ──▶ parallel, depends on ^typecheck
test      ──▶ parallel
```
