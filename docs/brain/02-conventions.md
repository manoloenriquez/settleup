# 02 — Conventions

## Naming

| Thing             | Convention           | Example                       |
|-------------------|----------------------|-------------------------------|
| Files             | `kebab-case`         | `sign-in-form.tsx`            |
| React components  | `PascalCase`         | `SignInForm`                  |
| Functions         | `camelCase`          | `getUserProfile()`            |
| Types / interfaces | `PascalCase`        | `UserProfile`                 |
| Zod schemas       | `camelCase + Schema` | `signInSchema`                |
| Constants         | `SCREAMING_SNAKE`    | `MAX_PAGE_SIZE`               |
| DB columns        | `snake_case`         | `avatar_url`                  |
| DB tables         | `snake_case plural`  | `user_profiles`               |

## File Structure (Next.js)

```
apps/web/src/
├── app/               Route segments (App Router)
│   ├── (auth)/        Route group: unauthenticated pages
│   │   ├── sign-in/
│   │   └── sign-up/
│   └── (dashboard)/   Route group: protected pages
│       └── dashboard/
├── components/        App-specific components (not shared)
├── lib/
│   ├── supabase/      Supabase client helpers
│   └── utils.ts       One-off utilities
├── hooks/             Custom React hooks
└── middleware.ts
```

## Component Rules

- **Server by default.** Only add `"use client"` when you need browser APIs, event handlers, or hooks.
- **Co-locate styles.** Prefer CSS Modules or Tailwind classes next to the component file.
- **Single responsibility.** Each component does one thing. Extract logic to hooks.

## Imports

Always use path aliases instead of relative `../../..` imports:

```ts
// Good
import { signInSchema } from "@template/shared";
import { Button } from "@template/ui";
import { createClient } from "@/lib/supabase/server";

// Bad
import { signInSchema } from "../../../packages/shared/src/schemas";
```

## Type Imports

Use inline `type` imports (enforced by ESLint):

```ts
import { type User } from "@template/shared";
import { createServerClient, type CookieAdapter } from "@template/supabase";
```

## Server Actions

- Validate all inputs with Zod before touching the DB.
- Return typed `ApiResponse<T>` from `@template/shared/types`.
- Never throw—always return `{ data: null, error: "message" }` on failure.

```ts
"use server";
import { signInSchema } from "@template/shared/schemas";
import type { ApiResponse } from "@template/shared/types";

export async function signIn(formData: FormData): Promise<ApiResponse<void>> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  // ...
  return { data: undefined, error: null };
}
```

## Git

- Branch: `feat/<name>`, `fix/<name>`, `chore/<name>`
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`)
- Never commit `.env` files
