import { describe, expect, it } from "vitest";
import {
  BACKOFF_MAX_MS,
  classifySyncError,
  createEmptyOutboxState,
  createSyncEngine,
  discardEntry,
  enqueue,
  markTerminalFailure,
  nextAttemptDelayMs,
  nextRunnable,
  parseOutboxState,
  recoverInflight,
} from "../offline";
import type {
  NewOutboxEntry,
  OutboxEntry,
  OutboxEntryKind,
  OutboxExecutionResult,
  OutboxState,
  OutboxStorageAdapter,
} from "../offline";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let counter = 0;

function makeInput(overrides: Partial<NewOutboxEntry> = {}): NewOutboxEntry {
  counter += 1;
  return {
    id: `entry-${counter}`,
    kind: "expense.create",
    entityId: `entity-${counter}`,
    groupId: "group-1",
    payload: { item_name: "Coffee", amount_cents: 500 },
    createdAt: new Date(2026, 0, 1, 0, 0, counter).toISOString(),
    summary: { title: "Coffee", amountCents: 500 },
    ...overrides,
  };
}

function memoryStorage(): OutboxStorageAdapter & { saved: OutboxState[] } {
  const saved: OutboxState[] = [];
  return {
    saved,
    load: async (): Promise<unknown> => saved.at(-1) ?? null,
    save: async (state: OutboxState): Promise<void> => {
      saved.push(state);
    },
  };
}

type ScriptedResult = OutboxExecutionResult | Error;

function scriptedExecutor(script: Record<string, ScriptedResult[]>): {
  executor: (entry: OutboxEntry) => Promise<OutboxExecutionResult>;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    executor: async (entry: OutboxEntry): Promise<OutboxExecutionResult> => {
      calls.push(entry.id);
      const queue = script[entry.id];
      const result = queue?.shift();
      if (result === undefined) return { ok: true };
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

function makeEngine(
  script: Record<string, ScriptedResult[]>,
  options: { nowMs?: () => number; maxAttempts?: number } = {},
): {
  engine: ReturnType<typeof createSyncEngine>;
  calls: string[];
  storage: ReturnType<typeof memoryStorage>;
} {
  const storage = memoryStorage();
  const { executor, calls } = scriptedExecutor(script);
  const engine = createSyncEngine({
    storage,
    executor,
    now: () => new Date(options.nowMs ? options.nowMs() : 1_700_000_000_000),
    random: () => 0.5, // jitter factor 1.0 — deterministic
    maxAttempts: options.maxAttempts,
  });
  return { engine, calls, storage };
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

describe("classifySyncError", () => {
  it("classifies the server contract codes", () => {
    expect(classifySyncError("PT409", "Expense was modified by someone else")).toBe("conflict");
    expect(classifySyncError("PT404", "Expense not found")).toBe("not_found");
    expect(classifySyncError("23505", "duplicate key value violates unique constraint")).toBe(
      "duplicate",
    );
  });

  it("classifies fetch-layer failures as network", () => {
    expect(classifySyncError(null, "TypeError: Failed to fetch")).toBe("network");
    expect(classifySyncError(null, "Network request failed")).toBe("network");
    expect(classifySyncError(null, "fetch failed")).toBe("network");
  });

  it("classifies timeouts and transient server errors as retryable", () => {
    expect(classifySyncError(null, "The operation was aborted")).toBe("retryable");
    expect(classifySyncError(null, "Request timed out")).toBe("retryable");
    expect(classifySyncError("PGRST301", "JWT expired")).toBe("retryable");
    expect(classifySyncError("40001", "serialization failure")).toBe("retryable");
    expect(classifySyncError("503", "Service Unavailable")).toBe("retryable");
  });

  it("classifies everything else as terminal", () => {
    expect(classifySyncError("P0001", "Not authorized")).toBe("terminal");
    expect(classifySyncError(null, "Split total must equal amount")).toBe("terminal");
    expect(classifySyncError("23514", "check constraint violated")).toBe("terminal");
  });
});

// ---------------------------------------------------------------------------
// Backoff
// ---------------------------------------------------------------------------

describe("nextAttemptDelayMs", () => {
  it("grows exponentially and caps at 5 minutes", () => {
    const noJitter = (): number => 0.5;
    expect(nextAttemptDelayMs(1, noJitter)).toBe(4_000);
    expect(nextAttemptDelayMs(2, noJitter)).toBe(8_000);
    expect(nextAttemptDelayMs(3, noJitter)).toBe(16_000);
    expect(nextAttemptDelayMs(10, noJitter)).toBe(BACKOFF_MAX_MS);
  });

  it("applies bounded jitter", () => {
    expect(nextAttemptDelayMs(1, () => 0)).toBe(3_200); // -20%
    expect(nextAttemptDelayMs(1, () => 0.999999)).toBeGreaterThan(4_700); // ≈ +20%
    expect(nextAttemptDelayMs(1, () => 0.999999)).toBeLessThanOrEqual(4_800);
  });
});

// ---------------------------------------------------------------------------
// Reducer: enqueue / coalescing
// ---------------------------------------------------------------------------

describe("outbox reducer", () => {
  it("appends entries in FIFO order and rejects duplicate ids", () => {
    let state = createEmptyOutboxState();
    const a = makeInput({ id: "a" });
    const b = makeInput({ id: "b" });
    state = enqueue(state, a);
    state = enqueue(state, b);
    state = enqueue(state, { ...b, payload: { changed: true } });
    expect(state.entries.map((e) => e.id)).toEqual(["a", "b"]);
    expect(state.entries[1]!.payload).toEqual(b.payload);
  });

  it("coalesces a second edit of the same entity in place", () => {
    let state = createEmptyOutboxState();
    const first = makeInput({ id: "e1", kind: "expense.update", entityId: "x" });
    const other = makeInput({ id: "o1", entityId: "other" });
    const second = makeInput({
      id: "e2",
      kind: "expense.update",
      entityId: "x",
      payload: { item_name: "Updated" },
    });
    state = enqueue(state, first);
    state = enqueue(state, other);
    state = enqueue(state, second);
    expect(state.entries.map((e) => e.id)).toEqual(["e2", "o1"]);
    // Keeps the original FIFO slot (createdAt) with the newest payload.
    expect(state.entries[0]!.createdAt).toBe(first.createdAt);
    expect(state.entries[0]!.payload).toEqual({ item_name: "Updated" });
  });

  it("delete of an unsynced local create cancels the whole chain locally", () => {
    let state = createEmptyOutboxState();
    state = enqueue(state, makeInput({ id: "c1", kind: "expense.create", entityId: "x" }));
    state = enqueue(state, makeInput({ id: "u1", kind: "expense.update", entityId: "x" }));
    state = enqueue(state, makeInput({ id: "keep", entityId: "y" }));
    state = enqueue(state, makeInput({ id: "d1", kind: "expense.delete", entityId: "x" }));
    expect(state.entries.map((e) => e.id)).toEqual(["keep"]);
  });

  it("delete of a server-side entity drops its queued edits but keeps the delete", () => {
    let state = createEmptyOutboxState();
    state = enqueue(state, makeInput({ id: "u1", kind: "expense.update", entityId: "srv" }));
    state = enqueue(state, makeInput({ id: "d1", kind: "expense.delete", entityId: "srv" }));
    expect(state.entries.map((e) => e.id)).toEqual(["d1"]);
  });
});

// ---------------------------------------------------------------------------
// Reducer: selection, blocking, recovery
// ---------------------------------------------------------------------------

describe("nextRunnable", () => {
  it("respects FIFO order and per-entity ordering", () => {
    let state = createEmptyOutboxState();
    state = enqueue(state, makeInput({ id: "a", entityId: "x" }));
    state = enqueue(state, makeInput({ id: "b", kind: "expense.update", entityId: "x" }));
    state = enqueue(state, makeInput({ id: "c", entityId: "y" }));
    expect(nextRunnable(state, new Date().toISOString())!.id).toBe("a");
  });

  it("skips retryable entries whose backoff has not elapsed, but not their entity-mates", () => {
    let state = createEmptyOutboxState();
    state = enqueue(state, makeInput({ id: "a", entityId: "x" }));
    state = enqueue(state, makeInput({ id: "b", kind: "expense.update", entityId: "x" }));
    state = enqueue(state, makeInput({ id: "c", entityId: "y" }));
    state = {
      entries: state.entries.map((e) =>
        e.id === "a"
          ? { ...e, status: "failed_retryable" as const, nextAttemptAt: "2999-01-01T00:00:00.000Z" }
          : e,
      ),
    };
    // "a" is waiting on backoff; "b" targets the same entity so it must wait too.
    expect(nextRunnable(state, "2026-01-01T00:00:00.000Z")!.id).toBe("c");
    // Once the backoff elapses, "a" runs first again.
    expect(nextRunnable(state, "2999-06-01T00:00:00.000Z")!.id).toBe("a");
  });
});

describe("terminal failure blocking and discard", () => {
  it("blocks later queued entries for the same entity and isolates others", () => {
    let state = createEmptyOutboxState();
    state = enqueue(state, makeInput({ id: "a", entityId: "x" }));
    state = enqueue(state, makeInput({ id: "b", kind: "expense.update", entityId: "x" }));
    state = enqueue(state, makeInput({ id: "c", entityId: "y" }));
    state = markTerminalFailure(state, "a", {
      class: "conflict",
      code: "PT409",
      message: "conflict",
    });

    const byId = new Map(state.entries.map((e) => [e.id, e]));
    expect(byId.get("a")!.status).toBe("failed");
    expect(byId.get("b")!.status).toBe("failed");
    expect(byId.get("b")!.lastError!.message).toMatch(/blocked/i);
    expect(byId.get("c")!.status).toBe("queued");
  });

  it("discarding a failed create removes its dependents", () => {
    let state = createEmptyOutboxState();
    state = enqueue(state, makeInput({ id: "a", kind: "expense.create", entityId: "x" }));
    state = enqueue(state, makeInput({ id: "b", kind: "expense.update", entityId: "x" }));
    state = enqueue(state, makeInput({ id: "c", entityId: "y" }));
    state = discardEntry(state, "a");
    expect(state.entries.map((e) => e.id)).toEqual(["c"]);
  });
});

describe("persistence guards", () => {
  it("recovers inflight entries to queued on boot", () => {
    let state = createEmptyOutboxState();
    state = enqueue(state, makeInput({ id: "a" }));
    state = { entries: state.entries.map((e) => ({ ...e, status: "inflight" as const })) };
    expect(recoverInflight(state).entries[0]!.status).toBe("queued");
  });

  it("degrades corrupt persisted state to an empty queue", () => {
    expect(parseOutboxState(null)).toEqual({ entries: [] });
    expect(parseOutboxState("garbage")).toEqual({ entries: [] });
    expect(parseOutboxState({ entries: [{ nonsense: true }] })).toEqual({ entries: [] });
  });

  it("round-trips valid state", () => {
    let state = createEmptyOutboxState();
    state = enqueue(state, makeInput());
    expect(parseOutboxState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
});

// ---------------------------------------------------------------------------
// Engine drains
// ---------------------------------------------------------------------------

describe("createSyncEngine", () => {
  it("drains FIFO, removes synced entries, and persists every transition", async () => {
    const { engine, calls, storage } = makeEngine({});
    await engine.init();
    await engine.enqueue(makeInput({ id: "a" }));
    await engine.enqueue(makeInput({ id: "b" }));

    const result = await engine.drain();
    expect(result).toEqual({ synced: 2, failed: 0, stoppedOffline: false });
    expect(calls).toEqual(["a", "b"]);
    expect(engine.getState().entries).toEqual([]);
    expect(storage.saved.length).toBeGreaterThan(0);
  });

  it("treats duplicate-key replays (23505) as success", async () => {
    const { engine } = makeEngine({
      a: [{ ok: false, code: "23505", message: "duplicate key value" }],
    });
    await engine.init();
    await engine.enqueue(makeInput({ id: "a" }));
    const result = await engine.drain();
    expect(result.synced).toBe(1);
    expect(engine.getState().entries).toEqual([]);
  });

  it("stops the drain on a network error without consuming an attempt", async () => {
    const { engine, calls } = makeEngine({
      a: [{ ok: false, code: null, message: "Network request failed" }],
    });
    await engine.init();
    await engine.enqueue(makeInput({ id: "a" }));
    await engine.enqueue(makeInput({ id: "b" }));

    const result = await engine.drain();
    expect(result).toEqual({ synced: 0, failed: 0, stoppedOffline: true });
    expect(calls).toEqual(["a"]);
    const entry = engine.getState().entries[0]!;
    expect(entry.status).toBe("queued");
    expect(entry.attempts).toBe(0);
  });

  it("schedules retryable failures with backoff and gives up after maxAttempts", async () => {
    let nowMs = 1_700_000_000_000;
    const { engine } = makeEngine(
      {
        a: [
          { ok: false, code: "503", message: "Service Unavailable" },
          { ok: false, code: "503", message: "Service Unavailable" },
        ],
      },
      { nowMs: () => nowMs, maxAttempts: 2 },
    );
    await engine.init();
    await engine.enqueue(makeInput({ id: "a" }));

    await engine.drain();
    let entry = engine.getState().entries[0]!;
    expect(entry.status).toBe("failed_retryable");
    expect(entry.attempts).toBe(1);
    expect(entry.nextAttemptAt).toBe(new Date(nowMs + 4_000).toISOString());
    expect(engine.earliestNextAttemptAt()).toBe(entry.nextAttemptAt);

    // Before the backoff elapses, drain is a no-op for the entry.
    await engine.drain();
    expect(engine.getState().entries[0]!.attempts).toBe(1);

    // After the backoff elapses, the retry runs and exhausts maxAttempts.
    nowMs += 10_000;
    const result = await engine.drain();
    entry = engine.getState().entries[0]!;
    expect(result.failed).toBe(1);
    expect(entry.status).toBe("failed");
  });

  it("isolates a terminal failure and continues with unrelated entries", async () => {
    const { engine, calls } = makeEngine({
      a: [{ ok: false, code: "P0001", message: "Not authorized" }],
    });
    await engine.init();
    await engine.enqueue(makeInput({ id: "a", entityId: "x" }));
    await engine.enqueue(makeInput({ id: "b", kind: "expense.update", entityId: "x" }));
    await engine.enqueue(makeInput({ id: "c", entityId: "y" }));

    const result = await engine.drain();
    expect(result).toEqual({ synced: 1, failed: 1, stoppedOffline: false });
    expect(calls).toEqual(["a", "c"]);
    const statuses = new Map(engine.getState().entries.map((e) => [e.id, e.status]));
    expect(statuses.get("a")).toBe("failed");
    expect(statuses.get("b")).toBe("failed");
  });

  it("treats executor exceptions like classified errors", async () => {
    const { engine } = makeEngine({ a: [new Error("Failed to fetch")] });
    await engine.init();
    await engine.enqueue(makeInput({ id: "a" }));
    const result = await engine.drain();
    expect(result.stoppedOffline).toBe(true);
    expect(engine.getState().entries[0]!.status).toBe("queued");
  });

  it("shares a single run between concurrent drain calls", async () => {
    const { engine, calls } = makeEngine({});
    await engine.init();
    await engine.enqueue(makeInput({ id: "a" }));
    const [r1, r2] = await Promise.all([engine.drain(), engine.drain()]);
    expect(calls).toEqual(["a"]);
    expect(r1).toBe(r2);
  });

  it("recovers persisted inflight entries and replays them after a crash", async () => {
    const storage = memoryStorage();
    const kinds: OutboxEntryKind[] = ["expense.create"];
    const entry: OutboxEntry = {
      id: "crashed",
      kind: kinds[0]!,
      entityId: "x",
      groupId: "g",
      payload: {},
      status: "inflight",
      attempts: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      nextAttemptAt: null,
      lastError: null,
      summary: { title: "Coffee", amountCents: 500 },
    };
    await storage.save({ entries: [entry] });

    const { executor, calls } = scriptedExecutor({});
    const engine = createSyncEngine({ storage, executor, random: () => 0.5 });
    await engine.init();
    expect(engine.getState().entries[0]!.status).toBe("queued");
    const result = await engine.drain();
    expect(result.synced).toBe(1);
    expect(calls).toEqual(["crashed"]);
  });

  it("retry resets a failed entry; discard removes it; clear empties the queue", async () => {
    const { engine } = makeEngine({
      a: [{ ok: false, code: "PT409", message: "conflict" }],
    });
    await engine.init();
    await engine.enqueue(makeInput({ id: "a" }));
    await engine.drain();
    expect(engine.getState().entries[0]!.status).toBe("failed");

    await engine.retry("a");
    const retried = engine.getState().entries[0]!;
    expect(retried.status).toBe("queued");
    expect(retried.attempts).toBe(0);
    expect(retried.lastError).toBeNull();

    await engine.discard("a");
    expect(engine.getState().entries).toEqual([]);

    await engine.enqueue(makeInput({ id: "b" }));
    await engine.clear();
    expect(engine.getState().entries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// New kinds: groups, categories, payment resolutions
// ---------------------------------------------------------------------------

describe("group/category/payment-resolution kinds", () => {
  it("parses persisted states containing every new kind", () => {
    const kinds: OutboxEntryKind[] = [
      "group.create",
      "category.create",
      "category.update",
      "category.delete",
      "payment.confirm",
      "payment.reject",
    ];
    let state = createEmptyOutboxState();
    for (const kind of kinds) {
      state = enqueue(state, makeInput({ kind }));
    }
    expect(parseOutboxState(JSON.parse(JSON.stringify(state))).entries).toHaveLength(kinds.length);
  });

  it("coalesces a second queued category.update of the same category", () => {
    let state = createEmptyOutboxState();
    state = enqueue(state, makeInput({ kind: "category.update", entityId: "cat-1", payload: { name: "Food" } }));
    state = enqueue(state, makeInput({ kind: "category.update", entityId: "cat-1", payload: { name: "Food & Drink" } }));
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]!.payload).toEqual({ name: "Food & Drink" });
  });

  it("category.delete cancels an unsynced category.create chain locally", () => {
    let state = createEmptyOutboxState();
    state = enqueue(state, makeInput({ kind: "category.create", entityId: "cat-1" }));
    state = enqueue(state, makeInput({ kind: "category.update", entityId: "cat-1" }));
    state = enqueue(state, makeInput({ kind: "category.delete", entityId: "cat-1" }));
    expect(state.entries).toHaveLength(0);
  });

  it("category.delete of a server category drops queued updates and keeps the delete", () => {
    let state = createEmptyOutboxState();
    state = enqueue(state, makeInput({ kind: "category.update", entityId: "cat-9" }));
    state = enqueue(state, makeInput({ kind: "category.delete", entityId: "cat-9" }));
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]!.kind).toBe("category.delete");
  });
});

describe("group dependency ordering", () => {
  it("does not run a dependent entry before its group.create", () => {
    let state = createEmptyOutboxState();
    state = enqueue(state, makeInput({ id: "g", kind: "group.create", entityId: "group-x", groupId: "group-x" }));
    state = enqueue(state, makeInput({ id: "e", kind: "expense.create", entityId: "exp-1", groupId: "group-x" }));
    // group.create runs first
    expect(nextRunnable(state, new Date().toISOString())?.id).toBe("g");
    // while the group.create is backing off, the dependent expense must wait
    const backingOff: OutboxState = {
      entries: state.entries.map((e) =>
        e.id === "g"
          ? { ...e, status: "failed_retryable" as const, nextAttemptAt: "2999-01-01T00:00:00.000Z" }
          : e,
      ),
    };
    expect(nextRunnable(backingOff, new Date().toISOString())).toBeNull();
  });

  it("terminal group.create failure blocks the group's queued entries", () => {
    let state = createEmptyOutboxState();
    state = enqueue(state, makeInput({ id: "g", kind: "group.create", entityId: "group-x", groupId: "group-x" }));
    state = enqueue(state, makeInput({ id: "e", kind: "expense.create", entityId: "exp-1", groupId: "group-x" }));
    state = markTerminalFailure(state, "g", { class: "terminal", code: null, message: "boom" });
    const dependent = state.entries.find((e) => e.id === "e");
    expect(dependent?.status).toBe("failed");
    expect(dependent?.lastError?.message).toMatch(/Blocked by an earlier failed change/);
  });

  it("discarding a failed group.create drops everything queued inside the group", () => {
    let state = createEmptyOutboxState();
    state = enqueue(state, makeInput({ id: "g", kind: "group.create", entityId: "group-x", groupId: "group-x" }));
    state = enqueue(state, makeInput({ id: "e", kind: "expense.create", entityId: "exp-1", groupId: "group-x" }));
    state = enqueue(state, makeInput({ id: "other", kind: "expense.create", entityId: "exp-2", groupId: "group-y" }));
    state = discardEntry(state, "g");
    expect(state.entries.map((e) => e.id)).toEqual(["other"]);
  });

  it("unrelated groups drain past a blocked group.create", () => {
    let state = createEmptyOutboxState();
    state = enqueue(state, makeInput({ id: "g", kind: "group.create", entityId: "group-x", groupId: "group-x" }));
    state = enqueue(state, makeInput({ id: "e", kind: "expense.create", entityId: "exp-1", groupId: "group-x" }));
    state = enqueue(state, makeInput({ id: "other", kind: "expense.create", entityId: "exp-2", groupId: "group-y" }));
    const blocked: OutboxState = {
      entries: state.entries.map((e) =>
        e.id === "g"
          ? { ...e, status: "failed_retryable" as const, nextAttemptAt: "2999-01-01T00:00:00.000Z" }
          : e,
      ),
    };
    expect(nextRunnable(blocked, new Date().toISOString())?.id).toBe("other");
  });
});
