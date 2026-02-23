# Feature Brief — [Feature Name]

> Copy this file to `docs/features/<slug>.md` before filling it out.
> Complete every section before writing any code.
> Incomplete or vague sections must be resolved with the user first.

---

## 1. Feature Goal

<!--
One paragraph. Answer:
  - What problem does this solve?
  - Who benefits and how?
  - What is explicitly out of scope?
-->

**Problem:**

**Benefit:**

**Out of scope:**

---

## 2. User Stories

<!--
Format: As a <role>, I want to <action> so that <outcome>.
Cover every role that interacts with this feature (user, admin, unauthenticated).
Mark each story with a priority: [P0] must-have | [P1] should-have | [P2] nice-to-have
-->

- [ ] [P0] As a **user**, I want to … so that …
- [ ] [P0] As an **admin**, I want to … so that …
- [ ] [P1] As an **unauthenticated visitor**, I want to … so that …

---

## 3. Database Changes

<!--
For each table: specify action (CREATE | ALTER | DROP) and every column change.
List indexes and foreign keys explicitly.
Never edit existing migrations — every change is a new migration file.
-->

### New tables

```sql
-- Table: <table_name>
-- Migration file: supabase/migrations/YYYYMMDDHHMMSS_<description>.sql

CREATE TABLE public.<table_name> (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- add columns here
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Altered tables

```sql
-- ALTER TABLE public.<existing_table> ADD COLUMN ...;
```

### Indexes

```sql
-- CREATE INDEX ON public.<table_name> (<column>);
```

### Type changes in `packages/supabase/src/database.types.ts`

- [ ] Add `<TableName>` row type
- [ ] Add `<TableName>Insert` / `<TableName>Update` types
- [ ] Add to `Tables<T>` union if applicable

---

## 4. RLS Rules

<!--
Define policies BEFORE writing application code.
For each table, list every policy using this format.
Use is_admin() for admin checks — never inline a subquery on profiles.
-->

### Table: `<table_name>`

| Operation | Role | Condition | Notes |
|---|---|---|---|
| SELECT | authenticated | `auth.uid() = user_id` | Own rows only |
| SELECT | admin | `is_admin()` | All rows |
| INSERT | authenticated | `auth.uid() = user_id` | |
| UPDATE | admin | `is_admin()` | |
| DELETE | admin | `is_admin()` | |

**Triggers required:**

- [ ] `BEFORE INSERT` — description
- [ ] `BEFORE UPDATE` — description (e.g. prevent field escalation)

---

## 5. Server Actions Required

<!--
One entry per action file or logical group.
All actions must: use assertAuth()/assertAdmin(), validate with Zod, return ApiResponse<T>.
-->

### `apps/web/src/app/actions/<domain>.ts`

| Action | Auth | Input (Zod schema) | Returns | Side effects |
|---|---|---|---|---|
| `createX` | authenticated | `CreateXSchema` | `ApiResponse<X>` | inserts row |
| `updateX` | authenticated | `UpdateXSchema` | `ApiResponse<X>` | updates row |
| `deleteX` | admin | `{ id: z.string().uuid() }` | `ApiResponse<void>` | deletes row |
| `adminListX` | admin | `PaginationSchema` | `ApiResponse<X[]>` | read-only |

**New Zod schemas needed in `packages/shared/src/schemas/index.ts`:**

```ts
export const CreateXSchema = z.object({
  // fields
});
```

---

## 6. Web Changes

<!--
List every new or modified file in apps/web.
Specify Server Component vs Client Component for each.
-->

### New routes

| Path | Type | Guard | Description |
|---|---|---|---|
| `/example` | Server Component | `requireAuth()` | |
| `/example/[id]` | Server Component | `requireAdmin()` | |

### New components

| File | Type | Purpose |
|---|---|---|
| `src/components/<feature>/XForm.tsx` | Client | Form for creating X |
| `src/components/<feature>/XTable.tsx` | Client | Admin table with mutations |
| `src/components/<feature>/XCard.tsx` | Server | Display card |

### Middleware changes

- [ ] Add `/example` to `apps/web/src/middleware.ts` matcher (if protected)

### Constants changes

- [ ] Add new route strings to `ROUTES` in `packages/shared/src/constants/index.ts`

---

## 7. Mobile Changes

<!--
List every new or modified file in apps/mobile.
Note if a change is iOS/Android only or shared.
-->

### New screens

| File | Route group | Auth required |
|---|---|---|
| `app/(protected)/example.tsx` | `(protected)` | yes |

### Context / hooks changes

- [ ] New method on `AuthContext`: `doX(params): Promise<ApiResponse<X>>`
- [ ] New hook: `src/hooks/useX.ts`

### New components

| File | Purpose |
|---|---|
| `src/components/ui/XComponent.tsx` | |

### Navigation changes

- [ ] New link from `home.tsx` to `/example`
- [ ] Back navigation handled by Expo Router stack (no manual handling needed)

---

## 8. Acceptance Criteria

<!--
Concrete, testable conditions. Each must be verifiable by a QA pass or automated test.
Format: Given <context>, when <action>, then <result>.
-->

### Functional

- [ ] Given an authenticated user, when they [action], then [expected result]
- [ ] Given an unauthenticated user, when they access [route], then they are redirected to `/login`
- [ ] Given an admin, when they [admin action], then [result]
- [ ] Given a non-admin, when they attempt [admin action], then they receive a 403 / error response

### Edge cases

- [ ] Duplicate submission is handled gracefully (unique constraint surfaced as user-readable error)
- [ ] Empty/invalid input is rejected by Zod before hitting the DB
- [ ] Concurrent mutations do not produce inconsistent state

### UI / UX

- [ ] Loading state shown during async operations
- [ ] Error messages are human-readable (not raw Postgres errors)
- [ ] Success state is clearly communicated

---

## 9. Security Considerations

<!--
Answer each question explicitly. "N/A" is acceptable only with a reason.
-->

| Question | Answer |
|---|---|
| Does this feature expose data across user boundaries? | |
| Are RLS policies the primary access control (not just app-layer checks)? | |
| Does any action accept user-controlled input that reaches SQL? | |
| Is `service_role` key required? If yes, why and where is it isolated? | |
| Can a user escalate their own role or permissions through this feature? | |
| Are file uploads involved? If yes, what MIME types and size limits are enforced? | |
| Does this feature send emails or external requests? If yes, is rate limiting applied? | |
| Is PII stored? If yes, which fields and is RLS sufficient protection? | |

**Threat summary:**

<!-- One paragraph describing the highest-risk attack vector and how it is mitigated. -->

---

## Implementation Order

<!--
Derived from the sections above. Do not start coding until this checklist is sequenced.
-->

- [ ] 1. Write and apply migration (`supabase/migrations/`)
- [ ] 2. Update `packages/supabase/src/database.types.ts`
- [ ] 3. Add Zod schemas to `packages/shared/src/schemas/index.ts`
- [ ] 4. Add route constants to `packages/shared/src/constants/index.ts`
- [ ] 5. Implement Server Actions (`apps/web/src/app/actions/`)
- [ ] 6. Build web UI (Server Components → Client Components)
- [ ] 7. Add/update middleware matcher and route guards
- [ ] 8. Implement mobile screens and context changes
- [ ] 9. Verify all acceptance criteria
- [ ] 10. Security review against Section 9
