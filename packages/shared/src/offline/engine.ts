// ---------------------------------------------------------------------------
// Offline sync core — engine
//
// Owns an OutboxState, persists it through the injected storage adapter on
// every transition, and drains it sequentially (FIFO) through the injected
// executor. Platforms decide *when* to drain (connectivity events, app
// foreground, timers armed to `earliestNextAttemptAt`).
// ---------------------------------------------------------------------------

import { MAX_RETRYABLE_ATTEMPTS, nextAttemptDelayMs } from "./backoff";
import { toOutboxError } from "./errors";
import {
  createEmptyOutboxState,
  discardEntry,
  earliestNextAttemptAt,
  enqueue,
  markInflight,
  markRetryableFailure,
  markSynced,
  markTerminalFailure,
  nextRunnable,
  parseOutboxState,
  recoverInflight,
  requeue,
  retryEntry,
} from "./outbox";
import type {
  DrainResult,
  NewOutboxEntry,
  OutboxEntry,
  OutboxExecutor,
  OutboxState,
  OutboxStorageAdapter,
} from "./types";

export type SyncEngineOptions = {
  storage: OutboxStorageAdapter;
  executor: OutboxExecutor;
  /** Injectable clock for tests. */
  now?: () => Date;
  /** Injectable RNG for deterministic backoff in tests. */
  random?: () => number;
  maxAttempts?: number;
  /** Called after every persisted state change (drive UI from this). */
  onChange?: (state: OutboxState) => void;
  /** Called when an entry fails terminally (drive toasts from this). */
  onEntryFailed?: (entry: OutboxEntry) => void;
};

export type SyncEngine = {
  /** Loads persisted state and requeues any interrupted `inflight` entries. */
  init: () => Promise<OutboxState>;
  enqueue: (input: NewOutboxEntry) => Promise<OutboxState>;
  enqueueBatch: (inputs: NewOutboxEntry[]) => Promise<OutboxState>;
  /** Sends runnable entries in FIFO order. Concurrent calls share one run. */
  drain: () => Promise<DrainResult>;
  retry: (id: string) => Promise<OutboxState>;
  discard: (id: string) => Promise<OutboxState>;
  /** Removes all entries (e.g. on sign-out). */
  clear: () => Promise<OutboxState>;
  getState: () => OutboxState;
  /** Earliest scheduled automatic retry, for arming platform timers. */
  earliestNextAttemptAt: () => string | null;
};

export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  const now = options.now ?? ((): Date => new Date());
  const random = options.random ?? Math.random;
  const maxAttempts = options.maxAttempts ?? MAX_RETRYABLE_ATTEMPTS;

  let state: OutboxState = createEmptyOutboxState();
  let initialized = false;
  let activeDrain: Promise<DrainResult> | null = null;

  let writes: Promise<void> = Promise.resolve();
  let activeInit: Promise<OutboxState> | null = null;

  function setState(
    transform: (current: OutboxState) => OutboxState | Promise<OutboxState>,
  ): Promise<void> {
    const operation = writes.then(async () => {
      const next = await transform(state);
      await options.storage.save(next);
      state = next;
      options.onChange?.(state);
    });
    // A failed save rejects its caller, but must not poison future retries.
    writes = operation.catch(() => undefined);
    return operation;
  }

  function init(): Promise<OutboxState> {
    if (activeInit) return activeInit;
    activeInit = setState(async () =>
      recoverInflight(parseOutboxState(await options.storage.load())),
    )
      .then(() => {
        initialized = true;
        return state;
      })
      .finally(() => {
        activeInit = null;
      });
    return activeInit;
  }

  async function ensureInitialized(): Promise<void> {
    if (!initialized) await init();
  }

  async function drainOnce(): Promise<DrainResult> {
    const result: DrainResult = { synced: 0, failed: 0, stoppedOffline: false };

    for (;;) {
      const reservation: { entry: OutboxEntry | null } = { entry: null };
      await setState((current) => {
        reservation.entry = nextRunnable(current, now().toISOString());
        return reservation.entry ? markInflight(current, reservation.entry.id) : current;
      });
      const entry = reservation.entry;
      if (!entry) break;

      let execution;
      try {
        execution = await options.executor(entry);
      } catch (error) {
        execution = {
          ok: false as const,
          code: null,
          message: error instanceof Error ? error.message : String(error),
        };
      }

      if (execution.ok) {
        await setState((current) => markSynced(current, entry.id));
        result.synced += 1;
        continue;
      }

      const outboxError = toOutboxError(execution.code, execution.message);
      switch (outboxError.class) {
        case "duplicate":
          // Already applied server-side — this replay is a success.
          await setState((current) => markSynced(current, entry.id));
          result.synced += 1;
          break;
        case "network":
          await setState((current) => requeue(current, entry.id));
          result.stoppedOffline = true;
          return result;
        case "retryable": {
          const delay = nextAttemptDelayMs(entry.attempts + 1, random);
          const nextAttemptAt = new Date(now().getTime() + delay).toISOString();
          await setState((current) =>
            markRetryableFailure(current, entry.id, outboxError, nextAttemptAt, maxAttempts),
          );
          const updated = state.entries.find((e) => e.id === entry.id);
          if (updated?.status === "failed") {
            result.failed += 1;
            options.onEntryFailed?.(updated);
          }
          break;
        }
        default: {
          await setState((current) => markTerminalFailure(current, entry.id, outboxError));
          result.failed += 1;
          const updated = state.entries.find((e) => e.id === entry.id);
          if (updated) options.onEntryFailed?.(updated);
          break;
        }
      }
    }

    return result;
  }

  return {
    init,

    async enqueue(input: NewOutboxEntry): Promise<OutboxState> {
      await ensureInitialized();
      await setState((current) => enqueue(current, input));
      return state;
    },

    async enqueueBatch(inputs: NewOutboxEntry[]): Promise<OutboxState> {
      await ensureInitialized();
      await setState((current) => inputs.reduce((next, input) => enqueue(next, input), current));
      return state;
    },

    async drain(): Promise<DrainResult> {
      await ensureInitialized();
      if (activeDrain) return activeDrain;
      activeDrain = drainOnce().finally(() => {
        activeDrain = null;
      });
      return activeDrain;
    },

    async retry(id: string): Promise<OutboxState> {
      await ensureInitialized();
      await setState((current) => retryEntry(current, id));
      return state;
    },

    async discard(id: string): Promise<OutboxState> {
      await ensureInitialized();
      await setState((current) => discardEntry(current, id));
      return state;
    },

    async clear(): Promise<OutboxState> {
      await ensureInitialized();
      await setState(() => createEmptyOutboxState());
      initialized = true;
      return state;
    },

    getState(): OutboxState {
      return state;
    },

    earliestNextAttemptAt(): string | null {
      return earliestNextAttemptAt(state);
    },
  };
}
