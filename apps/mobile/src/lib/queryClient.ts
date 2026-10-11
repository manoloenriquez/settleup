import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";

// Persisted cache lifetime: data older than this is dropped on restore, and
// gcTime must be at least this long or entries would be garbage-collected out
// of the persisted snapshot early.
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Bump when the shape of cached query data changes incompatibly. Restored data
 * is rendered before any refetch and is never re-validated, so an old shape
 * under a reused key crashes the screen that reads it.
 * v3: multi-currency (["dashboard"] became one summary per currency).
 */
export const CACHE_BUSTER = "native-v3-currency";

/** Query-key roots that must never be persisted (AI output, transient state). */
const NON_PERSISTED_KEYS = new Set(["ai", "insights", "ai-availability"]);

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000, // 30 seconds
        gcTime: CACHE_MAX_AGE_MS,
        retry: 1,
        refetchOnWindowFocus: true, // AppState-driven via focusManager
        refetchOnReconnect: true, // NetInfo-driven via onlineManager
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

const QUERY_CACHE_PREFIX = "tabkind:query-cache:";

function accountScope(ownerId: string | null): string {
  const project = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  return `${encodeURIComponent(project)}:${encodeURIComponent(ownerId ?? "signed-out")}`;
}

/** Storage key of an account's persisted server snapshot in this project. */
export function queryCacheKeyForAccount(ownerId: string): string {
  return `${QUERY_CACHE_PREFIX}${accountScope(ownerId)}`;
}

/** Prefix shared by every account's snapshot in this project. */
export function queryCacheProjectPrefix(): string {
  return `${QUERY_CACHE_PREFIX}${encodeURIComponent(process.env.EXPO_PUBLIC_SUPABASE_URL ?? "")}:`;
}

export function persistOptionsForAccount(
  ownerId: string | null,
): Omit<PersistQueryClientOptions, "queryClient"> {
  const scope = accountScope(ownerId);
  return {
    persister: createAsyncStoragePersister({
      storage: ownerId ? AsyncStorage : undefined,
      key: `${QUERY_CACHE_PREFIX}${scope}`,
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

/**
 * Remove every saved server snapshot on this device. They hold only
 * refetchable server data (never the outbox or personal expenses), so this is
 * the safe reset when restored data keeps a screen from rendering.
 */
export async function clearPersistedQueryCaches(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const doomed = keys.filter((key) => key.startsWith(QUERY_CACHE_PREFIX) || key === "settleup-query-cache");
  if (doomed.length > 0) await AsyncStorage.multiRemove(doomed);
}

/** Ignore and remove the unowned, refetchable snapshot from older releases. */
export async function removeLegacyQueryCache(): Promise<void> {
  await AsyncStorage.removeItem("settleup-query-cache");
}
