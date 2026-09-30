import AsyncStorage from "@react-native-async-storage/async-storage";
import { accountOutboxKey, parseOutboxState } from "@template/shared";
import { queryCacheProjectPrefix } from "@/lib/queryClient";
import { accountPersonalKey, accountPersonalPrefix } from "@/lib/personal/storage";

const OUTBOX_PREFIX = "tabkind:outbox:v2:";

/**
 * Keys that belong to accounts other than `currentOwnerId` in this project and
 * can be removed from the device:
 *  - every other account's persisted server snapshot (it is refetchable), and
 *  - every other account's outbox whose queue is empty.
 * A non-empty (or unreadable) outbox is kept: it holds writes that only that
 * account can replay, and deleting it would lose them.
 */
export function inactiveAccountKeys(
  allKeys: readonly string[],
  project: string,
  currentOwnerId: string | null,
  outboxIsEmpty: (key: string) => boolean,
  queryPrefix: string,
  personal?: { prefix: string; currentKey: string | null; isSynced: (key: string) => boolean },
): string[] {
  const outboxPrefix = `${OUTBOX_PREFIX}${encodeURIComponent(project)}:`;
  const currentQuery = currentOwnerId ? `${queryPrefix}${encodeURIComponent(currentOwnerId)}` : null;
  const currentOutbox = currentOwnerId && project ? accountOutboxKey(project, currentOwnerId) : null;
  return allKeys.filter((key) => {
    if (key.startsWith(queryPrefix)) return key !== currentQuery;
    if (key.startsWith(outboxPrefix)) return key !== currentOutbox && outboxIsEmpty(key);
    // An account's personal expenses: removable once everything is on the server.
    if (personal && key.startsWith(personal.prefix)) return key !== personal.currentKey && personal.isSynced(key);
    return false;
  });
}

/** True when a stored personal ledger has nothing waiting to upload. */
export function isFullySyncedLedger(raw: string | null): boolean {
  if (raw === null) return true;
  try {
    const parsed = JSON.parse(raw) as { expenses?: { sync?: unknown }[] };
    if (!Array.isArray(parsed.expenses)) return false;
    return parsed.expenses.every((expense) => expense.sync === "synced");
  } catch {
    return false;
  }
}

/** Only a readable envelope with an explicitly empty queue counts as empty. */
export function isEmptyOutbox(raw: string | null): boolean {
  if (raw === null) return true;
  try {
    const envelope: unknown = JSON.parse(raw);
    if (envelope === null || typeof envelope !== "object" || !("state" in envelope)) return false;
    const state = (envelope as { state: unknown }).state;
    if (state === null || state === undefined) return false;
    return parseOutboxState(state).entries.length === 0;
  } catch {
    return false;
  }
}

/**
 * Remove cached financial data of accounts that are no longer signed in on
 * this device, so the next person using the phone cannot recover it from
 * storage. Safe to call repeatedly; never removes unsynced changes.
 */
export async function purgeInactiveAccountData(currentOwnerId: string | null): Promise<void> {
  const project = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  const keys = await AsyncStorage.getAllKeys();
  const personalPrefix = accountPersonalPrefix();
  const readKeys = keys.filter((key) => key.startsWith(OUTBOX_PREFIX) || key.startsWith(personalPrefix));
  const values = new Map(await AsyncStorage.multiGet(readKeys));
  const doomed = inactiveAccountKeys(
    keys,
    project,
    currentOwnerId,
    (key) => isEmptyOutbox(values.get(key) ?? null),
    queryCacheProjectPrefix(),
    {
      prefix: personalPrefix,
      currentKey: currentOwnerId ? accountPersonalKey(currentOwnerId) : null,
      isSynced: (key) => isFullySyncedLedger(values.get(key) ?? null),
    },
  );
  if (doomed.length > 0) await AsyncStorage.multiRemove(doomed);
}
