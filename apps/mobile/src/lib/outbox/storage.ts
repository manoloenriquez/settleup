import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createAccountOutboxStorage,
  createOutboxLock,
  parseOutboxState,
  type OutboxStorageAdapter,
} from "@template/shared";

export const withOutboxLock = createOutboxLock();

export function outboxStorageFor(ownerId: string): OutboxStorageAdapter {
  return createAccountOutboxStorage(process.env.EXPO_PUBLIC_SUPABASE_URL ?? "", ownerId, {
    get: async (key): Promise<unknown> => {
      const raw = await AsyncStorage.getItem(key);
      return raw === null ? null : (JSON.parse(raw) as unknown);
    },
    set: async (key, value): Promise<void> => AsyncStorage.setItem(key, JSON.stringify(value)),
  });
}

export async function hasLegacyOutbox(): Promise<boolean> {
  const raw = await AsyncStorage.getItem("settleup-outbox");
  try {
    return parseOutboxState(raw === null ? null : (JSON.parse(raw) as unknown)).entries.length > 0;
  } catch {
    return true;
  }
}
