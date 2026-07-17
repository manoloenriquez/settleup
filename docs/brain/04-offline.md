# 04 — Offline Architecture

How SettleUp stays usable without a connection, on both the web PWA and the
Expo mobile app. Reads come from local caches; a small set of high-value
writes queue locally and sync automatically when connectivity returns.

## Design in one paragraph

Both apps share a pure **sync core** (`packages/shared/src/offline/`): an
outbox of queued writes with FIFO ordering, per-entity chains, exponential
backoff, error classification, and crash-safe persistence. Each platform
injects a storage adapter (AsyncStorage on mobile, IndexedDB via `idb-keyval`
on web) and an executor that replays entries through the **same Supabase RPCs
the online paths use** — RLS and in-RPC authorization apply identically.
Every queued create carries a **client-generated UUID that is also the row
id**, and the RPCs recognize a replay of an existing id and return the row
instead of duplicating it, so retries are always safe.

## Server contract (migration `20260716090000_offline_idempotency_and_updated_at`)

| Mechanism | Where | Behavior |
|---|---|---|
| Idempotent create | `create_expense`, `create_itemized_expense` (`p_input->>'id'`), `record_payment` (`p_id`) | If the id already exists and matches group/creator (payments: also from/to/amount), the existing row is returned with `"replayed": true`. Mismatch → SQLSTATE `PT409`. `create_expenses_batch` inherits per item. |
| Conflict detection (CAS) | `update_expense`, `update_itemized_expense` (`p_input->>'expected_updated_at'`) | Optional snapshot of the row's `updated_at` taken when the edit began; a mismatch raises `PT409` ("modified by someone else") instead of clobbering. |
| Deleted-elsewhere | same update RPCs | Missing row raises `PT404` so clients can say "deleted by someone else". |
| `updated_at` | `settleup.expenses`, `settleup.payments` | Touch-trigger maintained; backfilled from `created_at`. |
| Natural idempotency | expense delete (direct RLS delete), comment insert (client PK; replay hits `23505` = already applied) | No RPC changes needed. |

All new inputs/parameters are optional — pre-offline clients keep working.

## Sync core (`packages/shared/src/offline/`)

- `types.ts` — `OutboxEntry { id, kind, entityId, groupId, payload, status, attempts, createdAt, nextAttemptAt, lastError, summary }`; adapter interfaces.
- `outbox.ts` — pure reducer: enqueue (dedupe by id; a second queued edit of the same entity coalesces in place; a delete cancels an unsynced local create chain), inflight/synced/failure transitions, terminal failures block later entries for the same entity, `recoverInflight` on boot, Zod-validated `parseOutboxState` (corrupt storage → empty queue, never a crash).
- `errors.ts` — `classifySyncError`: `PT409`→conflict, `PT404`→not_found, `23505`→duplicate (treated as success), fetch-layer failures→network (stay queued, stop drain, no attempt consumed), timeouts/5xx/expired-JWT→retryable, everything else→terminal.
- `backoff.ts` — `min(2s·2^attempts, 5min)` ±20% jitter, max 8 attempts.
- `engine.ts` — owns state, persists every transition, drains sequentially (single-flight); platforms decide *when* to drain.

Tests: `packages/shared/src/__tests__/offline.test.ts` covers the whole state
machine deterministically (injected clock/RNG).

## Mobile (`apps/mobile`)

- **Reads**: React Query cache persisted to AsyncStorage (`PersistQueryClientProvider`, 7-day `maxAge`, versioned `buster`, AI/insights excluded) — data survives app kill; cold offline launches render saved data.
- **Connectivity/lifecycle** (`src/lib/network.ts`): NetInfo → `onlineManager` (queries pause offline, refetch on reconnect); AppState → `focusManager` (foreground refetch); AppState also gates `supabase.auth.startAutoRefresh()/stopAutoRefresh()`. The "Session expired" alert is suppressed while offline (a refresh that failed for lack of network is not an expired session).
- **Writes** (`src/context/OutboxContext.tsx`, `src/lib/outbox/*`): offline branches in `useAddExpense*`, `useRecordPayment`, `useUpdate*Expense`, `useDeleteExpense`, `useAddExpenseComment` queue the exact RPC input and return a locally built row. Drain triggers: reconnect, foreground, post-enqueue, backoff timer. Post-drain: standard invalidation set per affected group + synced/failed toasts.
- **Feedback**: global `OfflineBanner` (pending count → `PendingChangesSheet` with Retry/Discard), dashed "Pending" rows above the expense list, "N pending changes not yet included" note on the balances tab. Retry on a CAS conflict = explicit "reapply on top of latest" (stale snapshot dropped).
- **Sign-out** clears the query cache, its persisted snapshot, and the outbox.

## Web (`apps/web`)

- **Reads**: Serwist service worker (unchanged strategy): precached build assets + `/~offline` fallback, NetworkFirst pages/RSC, CacheFirst Supabase Storage images, NetworkOnly for Supabase API/auth and all non-GETs. Previously visited pages render stale offline; `OfflineBanner` makes that explicit.
- **Update UX**: manual SW registration (`components/pwa/SwRegistration.tsx`; `register: false`, `skipWaiting: false`) — a new deploy shows an "update available" toast; accepting posts `SKIP_WAITING` and reloads once on `controllerchange`. `/~offline` auto-reloads when connectivity returns.
- **Writes** (scoped to quick-add expense, full add-expense form, settle-up): offline submits queue in IndexedDB and replay through the **browser Supabase client** calling the same RPCs (deliberately not replaying Server Action POSTs — their encrypted ids rotate across deploys). Every queue operation runs inside a `navigator.locks` section with state re-read from IndexedDB first, so multiple tabs never clobber each other. Post-drain: `router.refresh()`.
- **Feedback**: floating "N pending" chip (`PendingChangesPopover`) with Retry/Discard; `useOfflineGuard()` gives online-only actions (login, comments, …) a clear offline message and preserves form state.
- **Explicitly out of scope**: offline reads beyond SW caching (a client-fetched data shell would fight the RSC convention), SW Background Sync (Chromium-only + the action-id problem), deferred media uploads, offline auth/AI/join/claim/member-CRUD/pending-payment-resolution.

## How to make another mutation offline-capable

1. Ensure the server path is replay-safe: accept a client UUID (exists-check →
   return existing row + `PT409` on mismatch) or rely on natural idempotency;
   for edits, add an `expected_updated_at` CAS guard (new migration, optional
   inputs only).
2. Thread `clientId`/`expectedUpdatedAt` through the `packages/supabase`
   builder and the shared Zod schema.
3. Add an `OutboxEntryKind` in `packages/shared/src/offline/types.ts` and map
   it in both executors (`apps/mobile/src/lib/outbox/executor.ts`,
   `apps/web/src/lib/outbox/executor.ts`).
4. Add the offline branch at the call site: build the RPC input with the
   builder, `enqueue({ id, kind, entityId, groupId, payload, createdAt,
   summary })`, return a locally built row.
5. Extend the pending UI if the entity renders in a list.

## Manual test matrix

| Scenario | Expected |
|---|---|
| Airplane mode, app killed, relaunch | Mobile: saved data renders + offline banner. Web (installed PWA): visited pages render, unvisited → `/~offline`. |
| Offline: add expenses (equal/custom/itemized), settle up | Queued with pending UI; forms behave as success; nothing lost on kill/reboot (persisted outbox). |
| Reconnect | Auto-drain; pending badges clear; exactly one row per action (verify after flaky reconnect loops too). |
| Crash/kill mid-drain | Interrupted `inflight` entries requeue on boot; replay creates no duplicates. |
| Two devices, concurrent appends | Both expenses/payments appear; balances recompute correctly (ledger append-only). |
| Two devices, edit same expense (one offline) | Offline replay fails with conflict; Pending Changes offers Retry (reapply on latest) / Discard; server value intact. |
| Edit offline while other device deletes | Replay fails "deleted by someone else". |
| Token expires while offline | Mobile stays signed in, no false "Session expired" alert; sync succeeds after reconnect+refresh. Web: middleware `?expired=1` flow on next online navigation. |
| Slow/flaky network (throttle + loss) | Backoff with jitter; drain stops on offline-classified errors without burning attempts. |
| New web deploy mid-session | "Update available" toast; refresh swaps versions once; no mid-session asset swap. |
| Two web tabs queue offline | Entries from both tabs survive (Web Locks + re-read); single tab drains. |
| Sign out with pending changes | Queue and caches cleared; nothing replays under the next account. |
