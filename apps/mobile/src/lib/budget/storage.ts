import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseBudgetStore, type BudgetStore } from "@template/shared";

// ---------------------------------------------------------------------------
// Where the budget lives on the device: one store for the guest and one per
// signed-in account, scoped by project and user id like personal expenses.
// ---------------------------------------------------------------------------

export const GUEST_BUDGET_KEY = "talli:budget:v1:guest";
const ACCOUNT_PREFIX = "talli:budget:v1:account:";

export function accountBudgetPrefix(): string {
  return `${ACCOUNT_PREFIX}${encodeURIComponent(process.env.EXPO_PUBLIC_SUPABASE_URL ?? "")}:`;
}

export function accountBudgetKey(ownerId: string): string {
  return `${accountBudgetPrefix()}${encodeURIComponent(ownerId)}`;
}

export function budgetStoreKey(ownerId: string | null): string {
  return ownerId ? accountBudgetKey(ownerId) : GUEST_BUDGET_KEY;
}

export async function loadBudgetStore(key: string, tracksSync: boolean): Promise<BudgetStore> {
  const raw = await AsyncStorage.getItem(key);
  if (raw === null) return parseBudgetStore(null, tracksSync);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("Your saved budget on this device could not be read. It has been kept.");
  }
  return parseBudgetStore(json, tracksSync);
}

export async function saveBudgetStore(key: string, store: BudgetStore): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(store));
}

export async function removeBudgetStore(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}

/** True when a stored account budget has nothing waiting to upload (safe to remove for another account). */
export function isSyncedBudgetStore(raw: string | null): boolean {
  if (raw === null) return true;
  try {
    const parsed = JSON.parse(raw) as { sync?: unknown };
    return parsed.sync === "synced";
  } catch {
    return false;
  }
}
