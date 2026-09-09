import { afterEach, describe, expect, it, vi } from "vitest";
import { makeQueryClient, persistOptionsForAccount } from "../query-client";
import { dehydrate } from "@tanstack/react-query";

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("idb-keyval", () => ({
  get: async (key: string) => storage.get(key),
  set: async (key: string, value: string) => {
    storage.set(key, value);
  },
  del: async (key: string) => {
    storage.delete(key);
  },
}));
afterEach(() => {
  storage.clear();
  vi.unstubAllEnvs();
});

describe("account-scoped query persistence", () => {
  it("restores only the matching account and project and disables signed-out persistence", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-one.invalid");
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
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-two.invalid");
    expect(await persistOptionsForAccount("alice").persister.restoreClient()).toBeUndefined();
    expect(bob.buster).not.toBe(alice.buster);
    client.clear();
  });
});
