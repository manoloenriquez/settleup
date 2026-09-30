import AsyncStorage from "@react-native-async-storage/async-storage";
import { parsePersonalLedger, type PersonalLedgerState } from "@template/shared";

// ---------------------------------------------------------------------------
// Where personal expenses live on the device.
//
// Guests use one device store. Each signed-in account gets its own store,
// scoped by project and user id like the query cache and outbox, so a second
// account on the same phone never sees another account's spending.
// ---------------------------------------------------------------------------

export const GUEST_PERSONAL_KEY = "talli:personal:v1:guest";
const ACCOUNT_PREFIX = "talli:personal:v1:account:";

export function accountPersonalKey(ownerId: string): string {
  const project = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  return `${ACCOUNT_PREFIX}${encodeURIComponent(project)}:${encodeURIComponent(ownerId)}`;
}

export function personalStoreKey(ownerId: string | null): string {
  return ownerId ? accountPersonalKey(ownerId) : GUEST_PERSONAL_KEY;
}

export async function loadPersonalLedger(key: string): Promise<PersonalLedgerState> {
  const raw = await AsyncStorage.getItem(key);
  if (raw === null) return parsePersonalLedger(null);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("Saved expenses on this device could not be read. They have been kept.");
  }
  return parsePersonalLedger(json);
}

export async function savePersonalLedger(key: string, state: PersonalLedgerState): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(state));
}
