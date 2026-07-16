import { del, get, set } from "idb-keyval";
import type { OutboxState, OutboxStorageAdapter } from "@template/shared";

const OUTBOX_STORAGE_KEY = "settleup-outbox";

/**
 * IndexedDB-backed persistence for the web offline outbox (idb-keyval —
 * IndexedDB survives storage pressure far better than localStorage). The
 * engine Zod-validates whatever `load` returns, so corrupt state degrades to
 * an empty queue instead of crashing.
 */
export const outboxStorage: OutboxStorageAdapter = {
  async load(): Promise<unknown> {
    try {
      return (await get<unknown>(OUTBOX_STORAGE_KEY)) ?? null;
    } catch {
      return null;
    }
  },

  async save(state: OutboxState): Promise<void> {
    // Structured clone requires plain data; state is JSON-safe by contract.
    await set(OUTBOX_STORAGE_KEY, JSON.parse(JSON.stringify(state)));
  },
};

/** Remove the persisted queue (sign-out). */
export async function clearOutboxStorage(): Promise<void> {
  await del(OUTBOX_STORAGE_KEY);
}
