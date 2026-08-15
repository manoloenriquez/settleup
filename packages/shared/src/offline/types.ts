// ---------------------------------------------------------------------------
// Offline sync core — types
//
// A platform-agnostic outbox of queued writes. Both apps enqueue the exact
// RPC input they would have sent online (built with the @template/supabase
// builders) together with a client-generated UUID that doubles as the
// server-side idempotency key, so every replay is safe.
//
// This module is pure: storage, networking, and scheduling are injected via
// the adapter interfaces below.
// ---------------------------------------------------------------------------

/** JSON-serializable value — outbox state must survive storage round-trips. */
export type OutboxJson =
  | string
  | number
  | boolean
  | null
  | { [key: string]: OutboxJson }
  | OutboxJson[];

/** The write kinds the sync engine knows how to replay. */
export type OutboxEntryKind =
  | "expense.create"
  | "expense.create_itemized"
  | "expense.update"
  | "expense.update_itemized"
  | "expense.delete"
  | "payment.record"
  | "payment.confirm"
  | "payment.reject"
  | "comment.create"
  | "group.create"
  | "category.create"
  | "category.update"
  | "category.delete";

export type OutboxEntryStatus =
  /** Waiting for the next drain. */
  | "queued"
  /** Currently being sent. Reset to "queued" on boot (replays are idempotent). */
  | "inflight"
  /** Failed with a transient error; retried automatically after `nextAttemptAt`. */
  | "failed_retryable"
  /** Failed terminally; waits for the user to Retry or Discard. */
  | "failed";

/** How a sync failure should be handled. */
export type SyncErrorClass =
  /** Device is offline / request never reached the server — stay queued, stop draining. */
  | "network"
  /** Transient server-side failure (5xx, timeout, expired JWT) — retry with backoff. */
  | "retryable"
  /** Compare-and-swap or idempotency-key mismatch (PT409) — needs the user's attention. */
  | "conflict"
  /** Target row is gone (PT404 / deleted elsewhere) — needs the user's attention. */
  | "not_found"
  /** Unique violation on a replayed insert (23505) — the write already applied; treat as success. */
  | "duplicate"
  /** Validation/authorization/unknown — retrying will not help. */
  | "terminal";

export type OutboxError = {
  class: SyncErrorClass;
  code: string | null;
  message: string;
};

/** Human-readable label for the Pending Changes UI. */
export type OutboxEntrySummary = {
  title: string;
  amountCents: number;
};

export type OutboxEntry = {
  /**
   * Client-generated UUID. For creates this is also the row id sent to the
   * server, making replays idempotent. Unique within the outbox.
   */
  id: string;
  kind: OutboxEntryKind;
  /**
   * Id of the row this entry targets (client UUID for local creates, server
   * UUID otherwise). Chains create → update → delete of the same entity.
   */
  entityId: string;
  groupId: string;
  /** The exact RPC/table input to replay, as built by the settleup builders. */
  payload: OutboxJson;
  status: OutboxEntryStatus;
  /** Retryable attempts consumed so far (offline failures don't count). */
  attempts: number;
  /** ISO timestamp; FIFO order key. */
  createdAt: string;
  /** ISO timestamp before which a `failed_retryable` entry must not run. */
  nextAttemptAt: string | null;
  lastError: OutboxError | null;
  summary: OutboxEntrySummary;
};

export type OutboxState = {
  entries: OutboxEntry[];
};

/** Everything the caller provides when enqueuing; the reducer fills the rest. */
export type NewOutboxEntry = {
  id: string;
  kind: OutboxEntryKind;
  entityId: string;
  groupId: string;
  payload: OutboxJson;
  createdAt: string;
  summary: OutboxEntrySummary;
};

// ---------------------------------------------------------------------------
// Platform adapter interfaces
// ---------------------------------------------------------------------------

/** Persists outbox state. Implementations: AsyncStorage (mobile), IndexedDB (web). */
export type OutboxStorageAdapter = {
  /** Returns the previously saved state, or null. Unknown shape — engine validates. */
  load: () => Promise<unknown>;
  save: (state: OutboxState) => Promise<void>;
};

/** Raw outcome of replaying one entry; the engine classifies the error. */
export type OutboxExecutionResult =
  | { ok: true }
  | { ok: false; code: string | null; message: string };

/** Maps an entry to the real network call (Supabase RPC / table op). */
export type OutboxExecutor = (entry: OutboxEntry) => Promise<OutboxExecutionResult>;

export type DrainResult = {
  synced: number;
  failed: number;
  /** True when the drain stopped early because the device appears offline. */
  stoppedOffline: boolean;
};
