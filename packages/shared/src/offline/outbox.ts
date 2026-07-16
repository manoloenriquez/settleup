// ---------------------------------------------------------------------------
// Offline sync core — pure outbox reducer
//
// All functions are pure: they take an OutboxState and return a new one.
// Array order is the canonical FIFO order (entries are appended on enqueue
// and coalescing preserves the position of the entry it replaces).
// ---------------------------------------------------------------------------

import { z } from "zod";
import type {
  NewOutboxEntry,
  OutboxEntry,
  OutboxError,
  OutboxJson,
  OutboxState,
} from "./types";

export function createEmptyOutboxState(): OutboxState {
  return { entries: [] };
}

// ---------------------------------------------------------------------------
// Persistence validation — corrupt or outdated stored state must degrade to
// an empty queue, never crash the app.
// ---------------------------------------------------------------------------

const outboxJsonSchema: z.ZodType<OutboxJson> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.record(z.string(), outboxJsonSchema),
    z.array(outboxJsonSchema),
  ]),
);

const outboxErrorSchema = z.object({
  class: z.enum(["network", "retryable", "conflict", "not_found", "duplicate", "terminal"]),
  code: z.string().nullable(),
  message: z.string(),
});

const outboxEntrySchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "expense.create",
    "expense.create_itemized",
    "expense.update",
    "expense.update_itemized",
    "expense.delete",
    "payment.record",
    "comment.create",
  ]),
  entityId: z.string().min(1),
  groupId: z.string().min(1),
  payload: outboxJsonSchema,
  status: z.enum(["queued", "inflight", "failed_retryable", "failed"]),
  attempts: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
  nextAttemptAt: z.string().nullable(),
  lastError: outboxErrorSchema.nullable(),
  summary: z.object({ title: z.string(), amountCents: z.number() }),
});

const outboxStateSchema = z.object({ entries: z.array(outboxEntrySchema) });

/** Validates persisted state; anything unparseable becomes an empty queue. */
export function parseOutboxState(raw: unknown): OutboxState {
  const result = outboxStateSchema.safeParse(raw);
  return result.success ? result.data : createEmptyOutboxState();
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

const UPDATE_KINDS = new Set<OutboxEntry["kind"]>(["expense.update", "expense.update_itemized"]);
const CREATE_KINDS = new Set<OutboxEntry["kind"]>([
  "expense.create",
  "expense.create_itemized",
  "payment.record",
  "comment.create",
]);

/**
 * Appends a new queued entry, applying the coalescing rules:
 *
 * - a duplicate `id` is rejected (idempotent enqueue);
 * - an update replaces an earlier *queued/failed* update of the same entity
 *   in place (server updates are full-replace, so local last-write-wins is safe);
 * - a delete of an entity whose create has not yet synced cancels the create
 *   and any queued updates — nothing needs to reach the server at all;
 * - a delete of a server-side entity drops that entity's queued updates
 *   (the delete makes them moot).
 */
export function enqueue(state: OutboxState, input: NewOutboxEntry): OutboxState {
  if (state.entries.some((e) => e.id === input.id)) return state;

  const entry: OutboxEntry = {
    ...input,
    status: "queued",
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
  };

  if (UPDATE_KINDS.has(entry.kind)) {
    const index = state.entries.findIndex(
      (e) => e.entityId === entry.entityId && UPDATE_KINDS.has(e.kind) && e.status !== "inflight",
    );
    if (index !== -1) {
      const entries = [...state.entries];
      entries[index] = { ...entry, createdAt: state.entries[index]!.createdAt };
      return { entries };
    }
  }

  if (entry.kind === "expense.delete") {
    const hasUnsyncedCreate = state.entries.some(
      (e) => e.entityId === entry.entityId && CREATE_KINDS.has(e.kind) && e.status !== "inflight",
    );
    const entries = state.entries.filter(
      (e) => !(e.entityId === entry.entityId && e.status !== "inflight"),
    );
    if (hasUnsyncedCreate) {
      // The row never reached the server — cancel locally, enqueue nothing.
      return { entries };
    }
    return { entries: [...entries, entry] };
  }

  return { entries: [...state.entries, entry] };
}

export function markInflight(state: OutboxState, id: string): OutboxState {
  return mapEntry(state, id, (e) => ({ ...e, status: "inflight" }));
}

/** The entry synced (or was already applied server-side) — remove it. */
export function markSynced(state: OutboxState, id: string): OutboxState {
  return { entries: state.entries.filter((e) => e.id !== id) };
}

/**
 * Device-offline failure: return the entry to the queue without consuming an
 * attempt. The drain stops and waits for the next connectivity event.
 */
export function requeue(state: OutboxState, id: string): OutboxState {
  return mapEntry(state, id, (e) => ({ ...e, status: "queued" }));
}

/**
 * Transient failure: consume an attempt and schedule the next one, or give up
 * (terminal `failed`) once `maxAttempts` is exhausted.
 */
export function markRetryableFailure(
  state: OutboxState,
  id: string,
  error: OutboxError,
  nextAttemptAt: string,
  maxAttempts: number,
): OutboxState {
  return mapEntry(state, id, (e) => {
    const attempts = e.attempts + 1;
    if (attempts >= maxAttempts) {
      return { ...e, status: "failed", attempts, nextAttemptAt: null, lastError: error };
    }
    return { ...e, status: "failed_retryable", attempts, nextAttemptAt, lastError: error };
  });
}

/**
 * Terminal failure (conflict / not-found / validation): the entry waits for
 * the user, and every later queued entry that targets the same entity is
 * blocked — replaying an edit on top of a failed create/edit makes no sense.
 */
export function markTerminalFailure(state: OutboxState, id: string, error: OutboxError): OutboxState {
  const target = state.entries.find((e) => e.id === id);
  if (!target) return state;

  const targetIndex = state.entries.indexOf(target);
  const entries = state.entries.map((e, index) => {
    if (e.id === id) {
      return { ...e, status: "failed" as const, nextAttemptAt: null, lastError: error };
    }
    if (
      index > targetIndex &&
      e.entityId === target.entityId &&
      (e.status === "queued" || e.status === "failed_retryable")
    ) {
      return {
        ...e,
        status: "failed" as const,
        nextAttemptAt: null,
        lastError: {
          class: "terminal" as const,
          code: null,
          message: "Blocked by an earlier failed change to the same item.",
        },
      };
    }
    return e;
  });
  return { entries };
}

/** User-initiated retry: back to the queue with a clean slate. */
export function retryEntry(state: OutboxState, id: string): OutboxState {
  return mapEntry(state, id, (e) => ({
    ...e,
    status: "queued",
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
  }));
}

/**
 * User-initiated discard. Discarding a failed create of a local-only entity
 * also removes its dependents — they can never succeed without it.
 */
export function discardEntry(state: OutboxState, id: string): OutboxState {
  const target = state.entries.find((e) => e.id === id);
  if (!target) return state;
  const dropDependents = CREATE_KINDS.has(target.kind);
  return {
    entries: state.entries.filter((e) => {
      if (e.id === id) return false;
      if (dropDependents && e.entityId === target.entityId) return false;
      return true;
    }),
  };
}

/** Boot recovery: an interrupted send is safe to repeat (idempotent replay). */
export function recoverInflight(state: OutboxState): OutboxState {
  return {
    entries: state.entries.map((e) => (e.status === "inflight" ? { ...e, status: "queued" } : e)),
  };
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/**
 * The next entry a drain should send: the first (FIFO) entry that is `queued`,
 * or `failed_retryable` whose `nextAttemptAt` has passed — skipping any entry
 * whose entity has an earlier not-yet-synced entry (per-entity ordering).
 */
export function nextRunnable(state: OutboxState, nowISO: string): OutboxEntry | null {
  const seenEntities = new Set<string>();
  for (const entry of state.entries) {
    const runnable =
      entry.status === "queued" ||
      (entry.status === "failed_retryable" &&
        entry.nextAttemptAt !== null &&
        entry.nextAttemptAt <= nowISO);
    if (runnable && !seenEntities.has(entry.entityId)) return entry;
    seenEntities.add(entry.entityId);
  }
  return null;
}

/** Earliest scheduled retry, so platforms can arm a wake-up timer. */
export function earliestNextAttemptAt(state: OutboxState): string | null {
  let earliest: string | null = null;
  for (const entry of state.entries) {
    if (entry.status === "failed_retryable" && entry.nextAttemptAt !== null) {
      if (earliest === null || entry.nextAttemptAt < earliest) earliest = entry.nextAttemptAt;
    }
  }
  return earliest;
}

export function pendingEntries(state: OutboxState): OutboxEntry[] {
  return state.entries.filter((e) => e.status !== "failed");
}

export function failedEntries(state: OutboxState): OutboxEntry[] {
  return state.entries.filter((e) => e.status === "failed");
}

function mapEntry(
  state: OutboxState,
  id: string,
  update: (entry: OutboxEntry) => OutboxEntry,
): OutboxState {
  return { entries: state.entries.map((e) => (e.id === id ? update(e) : e)) };
}
