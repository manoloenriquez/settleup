# 02 — Conventions

## Naming

| Thing              | Convention           | Example                        |
|--------------------|----------------------|--------------------------------|
| Files              | `kebab-case`         | `add-expense-form.tsx`         |
| React components   | `PascalCase`         | `AddExpenseForm`               |
| Functions          | `camelCase`          | `getMembersWithBalances()`     |
| Types              | `PascalCase`         | `GroupMember`                  |
| Zod schemas        | `camelCase + Schema` | `createExpenseSchema`          |
| Constants          | `SCREAMING_SNAKE`    | `MAX_PAGE_SIZE`                |
| DB columns         | `snake_case`         | `amount_cents`                 |
| DB tables          | `snake_case plural`  | `group_members`                |

## File Structure (Next.js)

```
apps/web/src/
├── app/
│   ├── actions/           Server Actions by domain
│   │   ├── expenses.ts
│   │   ├── balances.ts
│   │   ├── payments.ts
│   │   └── payment-profiles.ts
│   ├── (auth)/            Unauthenticated pages (sign-in, sign-up)
│   ├── (protected)/       Auth-guarded pages
│   │   ├── groups/
│   │   │   └── [groupId]/
│   │   └── account/
│   │       └── payment/
│   └── p/
│       └── [share_token]/ Public friend/share view (no auth)
├── components/
│   ├── ui/                Generic UI primitives
│   └── <feature>/         Feature-specific components
├── lib/
│   ├── supabase/          Supabase client helpers
│   ├── ai/                LLM provider abstraction
│   └── tokens.ts          Share token helpers (server-only, Node.js crypto)
└── middleware.ts
```

## Component Rules

- **Server by default.** Only add `"use client"` when you need browser APIs, event handlers, or hooks.
- **Data fetching in Server Components.** Never use `useEffect` for data. Use `React.cache()` to deduplicate.
- **Mutations via Server Actions.** Use `useTransition` on the client; call `router.refresh()` after success.

## Imports

Always use path aliases:

```ts
// Good
import { createExpenseSchema } from "@template/shared";
import { Button } from "@template/ui";
import { createClient } from "@/lib/supabase/server";

// Bad
import { createExpenseSchema } from "../../../packages/shared/src/schemas";
```

Use inline `type` imports:

```ts
import { type GroupMember } from "@template/supabase";
import { createServerClient, type CookieAdapter } from "@template/supabase";
```

## Server Actions

Pattern: `assertAuth()` → Zod parse → `createClient()` → DB call → return `ApiResponse<T>`

```ts
"use server";
import { assertAuth } from "@/lib/supabase/guards";
import { createClient } from "@/lib/supabase/server";
import { createExpenseSchema } from "@template/shared/schemas";
import type { ApiResponse } from "@template/shared/types";

export async function createExpense(formData: FormData): Promise<ApiResponse<void>> {
  const user = await assertAuth(); // throws AuthError if unauthenticated

  const parsed = createExpenseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema("settleup")
    .from("expenses")
    .insert({ ...parsed.data, created_by_user_id: user.id });

  if (error) return { data: null, error: error.message };
  return { data: undefined, error: null };
}
```

- All Server Actions return `ApiResponse<T>` — never throw to the client
- Validate all path/query identifiers (`groupId`, `memberId`) with `z.string().uuid()`
- Never use `SUPABASE_SERVICE_ROLE_KEY` in Server Actions

## Money

- Store all monetary values as **integer cents** (`amount_cents`, `share_cents`, `paid_cents`)
- Use `formatCents(n)` → `"₱1,234.56"` from `@template/shared`
- Use `parsePHPAmount("1,234.56")` → `123456` from `@template/shared`

## Upload Safety

- Validate MIME type + file size server-side before any Storage call
- Storage paths: `{userId}/{type}-{uuid}.ext`
- Never trust client-side `accept` attributes as a security boundary

## RPC Safety

- `SECURITY DEFINER` RPCs called by app users must enforce ownership in SQL
- Public (anon) RPCs must be token-scoped and return only minimum required fields
- `get_friend_view(p_share_token)` — anon-safe, callable with anon key

## Git

- Branch: `feat/<name>`, `fix/<name>`, `chore/<name>`
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`)
- Never commit `.env` files
