import { describe, expect, it } from "vitest";
import {
  accountOutboxKey,
  createAccountOutboxExecutor,
  createAccountOutboxStorage,
  createOutboxLock,
  createSyncEngine,
  type NewOutboxEntry,
  type OutboxIdentity,
  type OutboxKeyValueStorage,
} from "../offline";

const input = (id: string): NewOutboxEntry => ({
  id,
  entityId: id,
  groupId: "group",
  kind: "expense.create",
  payload: { item_name: "Lunch", amount_cents: 1200 },
  createdAt: "2026-09-09T00:00:00Z",
  summary: { title: "Lunch", amountCents: 1200 },
});

function memory(): OutboxKeyValueStorage & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>();
  return {
    values,
    get: async (key): Promise<unknown> => structuredClone(values.get(key) ?? null),
    set: async (key, value): Promise<void> => {
      values.set(key, structuredClone(value));
    },
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => {
    throw new Error("Not initialized");
  };
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("account-owned durable queues", () => {
  it("restores the original account's entries without exposing them to another account or project", async () => {
    const storage = memory();
    const original = createSyncEngine({
      storage: createAccountOutboxStorage("project-1", "alice", storage),
      executor: async () => ({ ok: true }),
    });
    await original.enqueue(input("alice-expense"));
    const otherAccount = createAccountOutboxStorage("project-1", "bob", storage);
    const otherProject = createAccountOutboxStorage("project-2", "alice", storage);
    expect(await otherAccount.load()).toBeNull();
    expect(await otherProject.load()).toBeNull();
    const restored = createSyncEngine({
      storage: createAccountOutboxStorage("project-1", "alice", storage),
      executor: async () => ({ ok: true }),
    });
    expect((await restored.init()).entries.map((entry) => entry.id)).toEqual(["alice-expense"]);
  });

  it("retains unowned legacy data without assigning it to a new login", async () => {
    const storage = memory();
    const legacy = { entries: [input("legacy-expense")] };
    storage.values.set("settleup-outbox", legacy);
    const engine = createSyncEngine({
      storage: createAccountOutboxStorage("project", "bob", storage),
      executor: async () => ({ ok: true }),
    });
    await engine.enqueue(input("bob-expense"));
    expect(storage.values.get("settleup-outbox")).toEqual(legacy);
    expect(engine.getState().entries.map((entry) => entry.id)).toEqual(["bob-expense"]);
  });

  it("never replaces a future-version, wrong-owner or malformed queue after failed initialization", async () => {
    for (const saved of [
      { version: 99, ownerId: "alice", state: { entries: [] } },
      { version: 2, ownerId: "bob", state: { entries: [] } },
      { version: 2, ownerId: "alice", state: { entries: "invalid" } },
      { version: 2, ownerId: "alice", state: null },
    ]) {
      const storage = memory();
      const key = accountOutboxKey("project", "alice");
      storage.values.set(key, saved);
      const engine = createSyncEngine({
        storage: createAccountOutboxStorage("project", "alice", storage),
        executor: async () => ({ ok: true }),
      });
      await expect(engine.init()).rejects.toThrow();
      await expect(engine.enqueue(input("new"))).rejects.toThrow();
      expect(storage.values.get(key)).toEqual(saved);
    }
  });

  it("finishes an in-flight request as its owner and pauses remaining work on account switch", async () => {
    const storage = memory();
    let identity: OutboxIdentity | null = { userId: "alice", accessToken: "alice-old-token" };
    const sent: string[] = [];
    const started = deferred();
    const response = deferred();
    const engine = createSyncEngine({
      storage: createAccountOutboxStorage("project", "alice", storage),
      executor: createAccountOutboxExecutor(
        "alice",
        () => identity,
        (token) => async () => {
          sent.push(token);
          started.resolve();
          await response.promise;
          return { ok: true };
        },
      ),
    });
    await engine.enqueueBatch([input("first"), input("second")]);
    const draining = engine.drain();
    await started.promise;
    identity = { userId: "bob", accessToken: "bob-token" };
    response.resolve();
    expect(await draining).toEqual({ synced: 1, failed: 0, stoppedOffline: true });
    expect(sent).toEqual(["alice-old-token"]);
    expect(engine.getState().entries.map((entry) => entry.id)).toEqual(["second"]);
    identity = null;
    expect((await engine.drain()).stoppedOffline).toBe(true);
    identity = { userId: "alice", accessToken: "alice-refreshed-token" };
    expect((await engine.drain()).synced).toBe(1);
    expect(sent).toEqual(["alice-old-token", "alice-refreshed-token"]);
  });

  it("serializes returning account providers without losing work and releases failed locks", async () => {
    const storage = memory();
    const lock = createOutboxLock();
    const adapter = createAccountOutboxStorage("project", "alice", storage);
    const oldProvider = createSyncEngine({
      storage: adapter,
      executor: async () => ({ ok: true }),
    });
    const newProvider = createSyncEngine({
      storage: adapter,
      executor: async () => ({ ok: true }),
    });
    await Promise.all([
      lock("alice", async () => {
        await oldProvider.init();
        await oldProvider.enqueue(input("first"));
      }),
      lock("alice", async () => {
        await newProvider.init();
        await newProvider.enqueue(input("second"));
      }),
    ]);
    expect(newProvider.getState().entries.map((entry) => entry.id)).toEqual(["first", "second"]);
    await expect(
      lock("alice", async () => {
        throw new Error("Device full");
      }),
    ).rejects.toThrow("Device full");
    expect(await lock("alice", async () => "available")).toBe("available");
  });
});
