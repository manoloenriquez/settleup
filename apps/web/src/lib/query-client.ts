import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";
import { get, set, del } from "idb-keyval";

// Persisted cache lifetime: data older than this is dropped on restore, and
// gcTime must be at least this long or entries would be garbage-collected out
// of the persisted snapshot early.
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Bump when the shape of cached query data changes incompatibly. */
const CACHE_BUSTER = "web-v3-currency";

/** Query-key roots that must never be persisted (AI output, identity, transient state). */
const NON_PERSISTED_KEYS = new Set(["ai", "insights", "ai-availability", "auth-user"]);

/**
 * Fresh client per provider mount (never a module singleton — SSR passes must
 * not share one across requests).
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000, // 30 seconds
        gcTime: CACHE_MAX_AGE_MS,
        retry: 1,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

// idb-keyval adapter; storage failures (quota, eviction, private browsing)
// degrade to "no persistence", never a crash.
const idbStringStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return (await get<string>(key)) ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await set(key, value);
    } catch {
      // Persistence is best-effort.
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await del(key);
    } catch {
      // Ignore.
    }
  },
};

export function persistOptionsForAccount(
  ownerId: string | null,
): Omit<PersistQueryClientOptions, "queryClient"> {
  const project = process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "";
  const scope = `${encodeURIComponent(project)}:${encodeURIComponent(ownerId ?? "signed-out")}`;
  return {
    persister: createAsyncStoragePersister({
      storage: ownerId ? idbStringStorage : undefined,
      key: `tabkind:query-cache:${scope}`,
      throttleTime: 2_000,
    }),
    maxAge: CACHE_MAX_AGE_MS,
    buster: `${CACHE_BUSTER}:${scope}`,
    dehydrateOptions: {
      shouldDehydrateQuery: (query) =>
        query.state.status === "success" && !NON_PERSISTED_KEYS.has(String(query.queryKey[0])),
    },
  };
}

/** The old snapshot has no verified owner. It contains only refetchable server data. */
export async function removeLegacyQueryCache(): Promise<void> {
  await idbStringStorage.removeItem("settleup-query-cache");
}
