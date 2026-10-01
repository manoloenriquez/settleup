import { afterEach, describe, expect, it, vi } from "vitest";
import { CACHE_BUSTER, clearPersistedQueryCaches, makeQueryClient, persistOptionsForAccount } from "../queryClient";
import { dehydrate } from "@tanstack/react-query";

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => storage.get(key),
    setItem: async (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: async (key: string) => {
      storage.delete(key);
    },
    getAllKeys: async () => [...storage.keys()],
    multiRemove: async (keys: string[]) => {
      for (const key of keys) storage.delete(key);
    },
  },
}));
afterEach(() => {
  storage.clear();
  vi.unstubAllEnvs();
});

describe("account-scoped query persistence", () => {
  it("restores only the matching account and project and disables signed-out persistence", async () => {
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", "https://project-one.invalid");
    const alice = persistOptionsForAccount("alice");
    const bob = persistOptionsForAccount("bob");
    const anonymous = persistOptionsForAccount(null);
    const client = makeQueryClient();
    client.setQueryData(["balances", "trip"], [{ name: "Alice", owed: 1200 }]);
    const snapshot = {
      timestamp: Date.now(),
      buster: alice.buster ?? "",
      clientState: dehydrate(client),
    };
    await alice.persister.persistClient(snapshot);
    expect(await alice.persister.restoreClient()).toEqual(snapshot);
    expect(await bob.persister.restoreClient()).toBeUndefined();
    await anonymous.persister.persistClient(snapshot);
    expect(await anonymous.persister.restoreClient()).toBeUndefined();
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", "https://project-two.invalid");
    expect(await persistOptionsForAccount("alice").persister.restoreClient()).toBeUndefined();
    expect(bob.buster).not.toBe(alice.buster);
    client.clear();
  });
});

describe("persisted cache reset", () => {
  it("drops saved snapshots from an older buster instead of restoring them", async () => {
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", "https://project-one.invalid");
    const options = persistOptionsForAccount("alice");
    // Build 1 saved the dashboard as one object; build 2 reads an array.
    const client = makeQueryClient();
    client.setQueryData(["dashboard"], { total_owed_cents: 100 });
    await options.persister.persistClient({
      timestamp: Date.now(),
      buster: "native-v2-account:" + encodeURIComponent("https://project-one.invalid") + ":alice",
      clientState: dehydrate(client),
    });
    const restored = await options.persister.restoreClient();
    expect(restored?.buster).not.toBe(options.buster);
    expect(options.buster?.startsWith(CACHE_BUSTER)).toBe(true);
    client.clear();
  });

  it("clears every saved snapshot and leaves other storage alone", async () => {
    storage.set("tabkind:query-cache:a:alice", "{}");
    storage.set("tabkind:query-cache:a:bob", "{}");
    storage.set("settleup-query-cache", "{}");
    storage.set("tabkind:outbox:a:alice", "[1]");
    await clearPersistedQueryCaches();
    expect([...storage.keys()]).toEqual(["tabkind:outbox:a:alice"]);
  });
});
