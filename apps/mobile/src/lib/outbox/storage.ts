import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Sentry from "@sentry/react-native";
import type { OutboxState, OutboxStorageAdapter } from "@template/shared";

const OUTBOX_STORAGE_KEY = "settleup-outbox";

/**
 * AsyncStorage-backed persistence for the offline outbox. The engine
 * Zod-validates whatever `load` returns, so corrupt or outdated JSON
 * degrades to an empty queue instead of crashing.
 */
export const outboxStorage: OutboxStorageAdapter = {
  async load(): Promise<unknown> {
    try {
      const raw = await AsyncStorage.getItem(OUTBOX_STORAGE_KEY);
      return raw === null ? null : (JSON.parse(raw) as unknown);
    } catch (error) {
      Sentry.addBreadcrumb({
        category: "outbox",
        message: "Failed to load persisted outbox; starting empty",
        level: "warning",
        data: { error: error instanceof Error ? error.message : String(error) },
      });
      return null;
    }
  },

  async save(state: OutboxState): Promise<void> {
    await AsyncStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(state));
  },
};

/** Remove the persisted queue (sign-out). */
export async function clearOutboxStorage(): Promise<void> {
  await AsyncStorage.removeItem(OUTBOX_STORAGE_KEY);
}
