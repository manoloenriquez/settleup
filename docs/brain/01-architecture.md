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

## AI Layer

Provider-abstracted LLM integration in `apps/web/src/lib/ai/`.

```
generateJSON<T>({ system, prompt, schema, userId })
    │
    ├── isLLMEnabled() check (LLM_ENABLED env var)
    ├── checkRateLimit(userId) — in-memory, per-user
    ├── createProvider() — Ollama (default) or OpenAI (LLM_PROVIDER env)
    ├── provider.generate({ system, prompt })
    ├── JSON.parse(result.text)
    └── schema.safeParse(parsed) — Zod validation
        → returns ApiResponse<T>
```

Feature modules:
- `receipt.ts` — OCR image → expense draft
- `smart-split.ts` — suggest split amounts
- `insights.ts` — spending analysis
- `conversation.ts` — natural language expense entry

**AI never writes to DB.** All AI output is a draft that the user must confirm.

## Environment Variables

### Web (`apps/web/.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL          client-safe
NEXT_PUBLIC_SUPABASE_ANON_KEY     client-safe (RLS enforced)
NEXT_PUBLIC_APP_URL               client-safe

SUPABASE_SERVICE_ROLE_KEY         server-only — NEVER use in app code
LLM_ENABLED                       true | false
LLM_PROVIDER                      ollama (default) | openai
OLLAMA_BASE_URL                   default: http://localhost:11434
OLLAMA_MODEL                      default: llama3.2
OLLAMA_API_KEY                    optional (ollama.com cloud)
OPENAI_API_KEY                    required if LLM_PROVIDER=openai
OPENAI_MODEL                      default: gpt-4o-mini
```

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
