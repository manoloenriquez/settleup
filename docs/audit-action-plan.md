# SettleUp Lite Audit Action Plan

Date: March 1, 2026

## Do Now (Quick Wins)

1. **Harden private RPC authorization and balance math** — **S**  
Status: Done in `supabase/migrations/20260301000001_harden_private_balance_rpcs.sql`.

2. **Enforce server-side QR upload validation (MIME + size)** — **S**  
Status: Done in `apps/web/src/app/actions/payment-profiles.ts`.

3. **Add runtime UUID/role validation in high-risk server actions** — **S**  
Status: Done across actions in `apps/web/src/app/actions/*`.

4. **Fix mobile Supabase client lifecycle and lint warnings** — **S**  
Status: Done in `apps/mobile/app/(protected)/groups/*`.

5. **Restore root test command parity with docs** — **S**  
Status: Done in root `package.json`.

## Next (Medium Effort)

1. **Add DB-level invariants for expense integrity** — **M**  
Add triggers/constraints for participant sum and payer sum matching expense total.

2. **Enforce cross-group consistency for participants/payers** — **M**  
Prevent linking a member to an expense from a different group.

3. **Rate-limit public token routes (`/p/*`, `/g/*`)** — **M**  
Add server-side throttling and abuse monitoring.

4. **Fix optimistic-success UI on delete actions** — **M**  
Only show success toast after checking `ApiResponse.error` in `GroupListItem` and `ExpenseList`.

5. **Create CI quality gates** — **M**  
Add GitHub Actions pipeline for `lint`, `typecheck`, and tests.

## Later (Large Refactors)

1. **Move multi-step mutations to transactional RPCs** — **L**  
Reduce partial-write risks in expense and related inserts.

2. **Consolidate dashboard stats into one SQL RPC** — **L**  
Replace N+1 balance fetch loop with a single aggregated query.

3. **Token lifecycle hardening** — **L**  
Introduce token rotation/invalidation UX and migration strategy for older short tokens.

4. **Add integration test suite for security boundaries** — **L**  
Cover RLS behavior, private/public RPC access, and mutation authorization paths.
