# SettleUp Lite Monorepo Audit Report

Date: March 1, 2026  
Scope: `apps/web`, `apps/mobile`, `packages/*`, `supabase/migrations/*`, workspace tooling/docs

## Security

1. **Critical**: Private RPC leaked cross-group data (`get_groups_with_stats`)
Evidence: `supabase/migrations/20260301000000_get_groups_with_stats_rpc.sql:40` filtered only `is_archived = FALSE` under `SECURITY DEFINER`.  
Recommendation: Enforce `owner_user_id = auth.uid()` inside RPC.  
Status: **Fixed** in `supabase/migrations/20260301000001_harden_private_balance_rpcs.sql:79-80`.

2. **Critical**: Private RPC leaked member/share-token data across groups (`get_member_balances`)
Evidence: `supabase/migrations/20260228000000_fix_rpc_payment_signs_v2.sql:35` had no ownership predicate under `SECURITY DEFINER`.  
Recommendation: Join `groups` and enforce ownership in SQL before returning balances.  
Status: **Fixed** in `supabase/migrations/20260301000001_harden_private_balance_rpcs.sql:29-30`.

3. **High**: Public share-link endpoints are not rate-limited
Evidence: `apps/web/src/app/p/[share_token]/page.tsx` and `apps/web/src/app/g/[shareToken]/page.tsx` call anon RPCs directly with no throttling.  
Recommendation: Add server-side/IP-based rate limiting at route/middleware boundary for `/p/*` and `/g/*`.

4. **Medium**: Share token entropy for newly generated member tokens was low
Evidence: token generator default was 10 chars (docs also referenced this at `README.md:51`).  
Recommendation: Increase default token length; plan rotation strategy for existing short tokens.  
Status: **Partially fixed** by increasing generator default to 22 chars in `apps/web/src/lib/tokens.ts:10`.

5. **Medium**: Missing server-side QR file validation (type/size) on upload path
Evidence: upload action previously accepted `File` without strict MIME/size checks.  
Recommendation: Validate MIME + size before storage upload and avoid raw internal error messages.  
Status: **Fixed** in `apps/web/src/app/actions/payment-profiles.ts:14-15,79-83,101`.

## DX

1. **Medium**: Root test command missing (README referenced `pnpm test`)
Evidence: README referenced `pnpm test` (`README.md:42`) but root script was absent.  
Recommendation: Add root `test` script delegating to Turborepo.  
Status: **Fixed** in `package.json` (`"test": "turbo run test"`).

2. **Medium**: Mobile lint warnings from unstable Supabase client creation in components
Evidence: lint previously reported `react-hooks/exhaustive-deps` warnings for `supabase` dependencies.  
Recommendation: Use shared singleton client in screens.  
Status: **Fixed** in:
- `apps/mobile/app/(protected)/groups/index.tsx:15`
- `apps/mobile/app/(protected)/groups/[id].tsx:14`
- `apps/mobile/app/(protected)/groups/[id]/add-expense.tsx:16`

3. **Low**: Web lint command is on deprecated `next lint`
Evidence: `apps/web/package.json` script plus runtime lint warning during audit.  
Recommendation: Migrate to ESLint CLI (`next-lint-to-eslint-cli` codemod) and include Next plugin config explicitly.

## Architecture

1. **Medium**: Documentation drift
Evidence: README had outdated mobile version (`README.md:196`) and stale token length wording (`README.md:51`).  
Recommendation: Keep docs synchronized with implementation; enforce via release checklist.  
Status: **Partially fixed** (README updated for Expo 54 and new token wording).

2. **Medium**: No CI workflows found for monorepo quality gates
Evidence: no `.github/workflows/*` present.  
Recommendation: Add CI pipeline for `lint`, `typecheck`, and tests (at minimum shared package tests).

3. **Low**: Build task currently exposes `SUPABASE_SERVICE_ROLE_KEY` to Turbo build env
Evidence: `turbo.json:7`.  
Recommendation: Remove from build task env unless explicitly required by build-time code.

## Data Integrity

1. **High**: Expense creation is not transactional
Evidence: `apps/web/src/app/actions/expenses.ts` writes `expenses`, then `expense_participants`, then `expense_payers` in separate operations.  
Risk: partial writes on mid-sequence failure.  
Recommendation: move mutation into a transactional SQL RPC or edge function.

2. **High**: No DB-enforced sum constraints for participants/payers vs expense total
Evidence: app-level validation in Zod exists, but DB tables only enforce positive payer amount (`supabase/migrations/20260225000001_expense_payers_and_audit.sql:9`) and no cross-row sum checks.  
Recommendation: add DB trigger(s) validating:
- sum(`expense_participants.share_cents`) == `expenses.amount_cents`
- sum(`expense_payers.paid_cents`) == `expenses.amount_cents`

3. **High**: Cross-group integrity not enforced on participant/payer membership
Evidence:
- `expense_participants` only has independent FKs (`supabase/migrations/20250223000001_settleup_schema.sql:95-96`)
- `expense_payers` same pattern (`supabase/migrations/20260225000001_expense_payers_and_audit.sql:7-8`)  
Risk: member from one group can be linked to expense in another group.  
Recommendation: enforce `(expense_id -> group_id)` and `(member_id -> group_id)` consistency via trigger or schema redesign.

4. **Medium**: Directional payment columns remain nullable
Evidence: migration adds `from_member_id` / `to_member_id` without `NOT NULL` (`supabase/migrations/20260225000002_directional_payments.sql:4-5`).  
Recommendation: backfill/cleanup then set `NOT NULL` if domain requires every payment be directional.

## Performance

1. **Medium**: Dashboard has N+1 RPC pattern
Evidence: per-group loop in `apps/web/src/app/actions/dashboard.ts:46-47` calls `get_member_balances` repeatedly.  
Recommendation: compute user net balance in one SQL RPC over all groups.

2. **Low**: Several web surfaces use raw `<img>` without Next image optimization
Evidence: `FriendView.tsx`, `GroupOverview.tsx`, `PaymentProfileForm.tsx`, `ReceiptUploader.tsx` (`rg` hits).  
Recommendation: use `next/image` where practical or add lazy loading/size hints consistently.

3. **Low**: Mobile screens recreated Supabase client each render
Evidence: prior `createMobileClient()` usage in three screens.  
Recommendation: singleton client import.  
Status: **Fixed** (same files listed in DX section).

## UX

1. **Medium**: Group detail clarity for balances/settlement was weak
Evidence: no at-a-glance outstanding/pending summary above tabs before this audit.  
Recommendation: add summary KPIs near header.  
Status: **Fixed** in `apps/web/src/app/(protected)/groups/[groupId]/page.tsx` (new Outstanding/Pending card).

2. **Medium**: Destructive actions show success even on server failure
Evidence:
- `apps/web/src/components/groups/GroupListItem.tsx:39-40`
- `apps/web/src/components/groups/ExpenseList.tsx:49-50`  
Recommendation: check returned `ApiResponse.error` before success toast/refresh.

## Testing & Quality Gates

1. **Medium**: Integration coverage gap for security-sensitive RPCs and actions
Evidence: tests exist only in shared utils (`packages/shared/src/__tests__/*`), none for RPC authorization behavior.  
Recommendation: add integration tests for:
- private RPC ownership isolation
- public share-link RPC data minimization
- mutation authorization failure paths

2. **Low**: Shared logic tests are present and healthy
Evidence: `packages/shared/src/__tests__/` with 46 passing tests during audit run.  
Recommendation: keep this baseline and extend to server action and RPC layers.

3. **Medium**: Convention mismatch in server actions
Evidence: `apps/web/src/app/actions/auth.ts:46` has `signOut(): Promise<void>` while conventions require `ApiResponse<T>` (`CLAUDE.md:48`, `docs/brain/02-conventions.md:66`).  
Recommendation: normalize action return contracts or explicitly document `redirect-only` exceptions.

## Changes Implemented In This Audit

- Added migration to harden private balance RPC authorization and fix stats formula:  
  `supabase/migrations/20260301000001_harden_private_balance_rpcs.sql`
- Added server-side QR upload MIME/size validation + safer error handling:  
  `apps/web/src/app/actions/payment-profiles.ts`
- Added runtime UUID/role validation in high-risk server actions:  
  `groups.ts`, `members.ts`, `expenses.ts`, `payments.ts`, `profile.ts`, `waitlist.ts`, `activity.ts`, `balances.ts`
- Increased default share token length for newly created tokens:  
  `apps/web/src/lib/tokens.ts`
- Improved group detail UX with Outstanding/Pending summary card:  
  `apps/web/src/app/(protected)/groups/[groupId]/page.tsx`
- Standardized mobile Supabase usage to singleton client:  
  `apps/mobile/app/(protected)/groups/*`
- Added root test script:  
  `package.json`
- Updated conventions/docs where standards were introduced:
  - `docs/brain/02-conventions.md`
  - `README.md`
