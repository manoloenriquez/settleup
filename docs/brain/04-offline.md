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

## Server contract (migrations `20260716090000_offline_idempotency_and_updated_at`, `20260814090000_offline_group_category_payment_idempotency`)

| Mechanism | Where | Behavior |
|---|---|---|
| Idempotent create | `create_expense`, `create_itemized_expense` (`p_input->>'id'`), `record_payment` (`p_id`), `create_group_with_owner` (`p_id`), `create_expense_category` (`p_id`) | If the id already exists and matches group/creator (payments: also from/to/amount), the existing row is returned with `"replayed": true`. Mismatch → SQLSTATE `PT409`. `create_expenses_batch` inherits per item. |
| Conflict detection (CAS) | `update_expense`, `update_itemized_expense` (`p_input->>'expected_updated_at'`), `update_expense_category` (`p_expected_updated_at`) | Optional snapshot of the row's `updated_at` taken when the edit began; a mismatch raises `PT409` ("modified by someone else") instead of clobbering. |
| Deleted-elsewhere | same update RPCs | Missing row raises `PT404` so clients can say "deleted by someone else". |
| Status-transition idempotency | `resolve_pending_payment` (via `confirm_payment` / `reject_payment`) | Resolving to the status the payment already has returns `"replayed": true`; resolving a payment that raced to the *other* status raises `PT409`; missing payment raises `PT404`. |
| `updated_at` | `settleup.expenses`, `settleup.payments`, `settleup.expense_categories` | Touch-trigger maintained; backfilled from `created_at`. |
| Natural idempotency | expense delete (direct RLS delete), category delete (missing row = success), comment insert (client PK; replay hits `23505` = already applied) | Delete replays are no-ops by design. |

All new inputs/parameters are optional — pre-offline clients keep working.
**Online-only by design:** undo-last-payment. The server picks "the latest
payment" at execution time and call sites hold no payment id, so a deferred
replay could delete a different payment recorded meanwhile — both apps guard
it with a clear "needs a connection" message instead of queueing.

## Sync core (`packages/shared/src/offline/`)

- `types.ts` — `OutboxEntry { id, kind, entityId, groupId, payload, status, attempts, createdAt, nextAttemptAt, lastError, summary }`; adapter interfaces. Thirteen kinds: `expense.create`, `expense.create_itemized`, `expense.update`, `expense.update_itemized`, `expense.delete`, `payment.record`, `payment.confirm`, `payment.reject`, `comment.create`, `group.create`, `category.create`, `category.update`, `category.delete`.
- `outbox.ts` — pure reducer: enqueue (dedupe by id; a second queued edit of the same entity coalesces in place; a delete cancels an unsynced local create chain), inflight/synced/failure transitions, terminal failures block later entries for the same entity, `recoverInflight` on boot, Zod-validated `parseOutboxState` (corrupt storage → empty queue, never a crash). **Group dependency ordering**: an entry whose `groupId` matches an earlier unsynced `group.create`'s `entityId` never runs before it, is blocked by its terminal failure, and is dropped when it's discarded. `OUTBOX_UPDATE_KINDS` is exported so both platforms' conflict-retry ("reapply on top of latest": strip `expected_updated_at`, re-enqueue same id) shares one definition.
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

- **Reads**: the core views (dashboard, groups list, group detail, activity,
  insights) are client components consuming **React Query hooks**
  (`src/hooks/queries.ts`) whose fetchers call **Supabase directly from the
  browser** (`src/lib/queries/*` — the same RLS-guarded selects/RPCs the
  mobile services use). The RSC pages are deliberately thin shells with
  **zero data awaits** (auth rides on middleware + the layout's single
  deduped `cachedProfile`), so navigation paints instantly from the persisted
  cache and revalidates in the background — refetches are parallel
  single-round-trip PostgREST calls, not serialized Server Action POSTs.
  `experimental.staleTimes.dynamic` lets back/forward reuse the router cache.
  First-ever visits (empty cache) render neutral skeletons; a bad group id
  renders a client-side not-found card (the server `notFound()` is gone).
  The cache persists to IndexedDB (`src/lib/query-client.ts`: 7-day `maxAge`,
  `buster` `"web-v1"` — bump it whenever a cached query's shape changes —
  AI/insights/auth-user excluded); query keys mirror mobile's shapes
  (`src/lib/query-keys.ts`). Expense pagination is a `useInfiniteQuery`, so
  loaded pages persist and paginate offline. Converted views invalidate keys
  (`invalidateGroupData`) instead of `router.refresh()`; `GroupRealtimeRefresher`
  (dynamically imported to keep the Realtime chunk off the critical path)
  invalidates (debounced), re-invalidates on channel re-subscribe after a
  dropped connection, and **skips the echo of this tab's own writes** (a
  3s `wasRecentlyInvalidatedLocally` window stamped by `invalidateGroupData`
  and by outbox drains). Remaining RSC pages (settings, account, admin) keep
  `router.refresh()` **plus** targeted query invalidations so the converted
  views are fresh on return-navigation. Outbox drains invalidate only —
  no post-drain `router.refresh()`.
- **Service worker** (Serwist, unchanged strategy): precached build assets +
  `/~offline` shell, NetworkFirst pages/RSC, CacheFirst Supabase Storage
  images, NetworkOnly for Supabase API/auth and all non-GETs. A previously
  visited route offline = cached document + live data from the persisted
  query cache. **Residual limitation**: a route never visited on the device
  has no cached RSC payload and falls back to `/~offline` (which links to the
  Dashboard/Groups hubs); browsing the groups list online prefetches group
  pages into the SW cache. `navigator.storage.persist()` is requested to
  protect IndexedDB from eviction.
- **Update UX**: manual SW registration (`components/pwa/SwRegistration.tsx`; `register: false`, `skipWaiting: false`) — a new deploy shows an "update available" toast; accepting posts `SKIP_WAITING` and reloads once on `controllerchange`. `/~offline` auto-reloads when connectivity returns.
- **Writes** (full parity with mobile — all thirteen kinds): offline submits queue in IndexedDB and replay through the **browser Supabase client** calling the same RPCs (deliberately not replaying Server Action POSTs — their encrypted ids rotate across deploys). Every queue operation runs inside a `navigator.locks` section with state re-read from IndexedDB first, so multiple tabs never clobber each other. Drain triggers: mount, reconnect, tab visible, post-enqueue, and a timer armed to the earliest scheduled backoff retry. Post-drain: query invalidation for affected groups (+ `router.refresh()` for the still-RSC pages). Terminal failures emit a Sentry breadcrumb; storage-quota failures degrade to in-memory only.
- **Feedback**: floating "N pending" chip (`PendingChangesPopover`, Retry/Discard; Retry on a CAS conflict = reapply on latest); dashed pending rows above the expense list; "N pending changes not yet included" note on the balances tab; pending group cards (non-navigable) in the groups list; queued payment resolutions render as "Confirming…/Rejecting…"; pending comments show "sending…". All derived at render time from outbox entries — the query cache stays pure server data. `useOfflineGuard()` covers the remaining online-only actions (login, comment delete, undo-payment).
- **Explicitly out of scope**: offline routing to never-visited pages (needs abandoning RSC for a client shell), SW Background Sync (Chromium-only + the action-id problem), deferred media uploads, offline auth/AI/join/claim/member-CRUD, group rename/archive/budget/recurring, cross-tab query-cache broadcast (`broadcastQueryClient` is experimental; per-tab caches reconcile via `refetchOnWindowFocus`).

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
| Airplane mode, app killed, relaunch | Mobile: saved data renders + offline banner. Web (installed PWA): visited dashboard/groups/group-detail render **live cached data** (not `/~offline`); unvisited routes → `/~offline` shell with links to cached hubs. |
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
| Sign out with pending changes | Queue and caches cleared (web: outbox + in-memory + persisted query cache); nothing replays under the next account. |
| Offline: edit expense, then reconnect | Exactly one updated row; a second offline edit before reconnect coalesces into one entry. |
| Offline: delete an expense created offline | Nothing hits the server (local chain cancelled); pending rows disappear. |
| Offline: create group → reconnect | Dashed pending card in groups list (not navigable); reconnect creates exactly one group; expenses queued into it wait for the `group.create` and drain after it. |
| Offline: rename a category twice | Single coalesced `category.update` replay. |
| Offline: confirm a pending payment | Row shows "Confirming…"; reconnect resolves once; balances update. |
| Confirm offline while another device rejects | Replay raises `PT409` → "Already resolved differently" in Pending Changes; Discard clears it. |
| Two web tabs open, one mutates | The other tab's queries refetch on focus (`refetchOnWindowFocus`). |
| Deploy mid-session with a persisted cache | Update toast as before; if cached data shapes changed, the bumped `buster` invalidates the snapshot cleanly. |
