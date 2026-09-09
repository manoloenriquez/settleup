import { del, get, set } from "idb-keyval";
import * as Sentry from "@sentry/nextjs";
import type { OutboxState, OutboxStorageAdapter } from "@template/shared";

const OUTBOX_STORAGE_KEY = "settleup-outbox";

/**
 * IndexedDB-backed persistence for the web offline outbox (idb-keyval —
 * IndexedDB survives storage pressure far better than localStorage). The
 * engine Zod-validates whatever `load` returns, so invalid state stops sync without overwriting the saved queue.
 */
export const outboxStorage: OutboxStorageAdapter = {
  async load(): Promise<unknown> {
    try {
      return (await get<unknown>(OUTBOX_STORAGE_KEY)) ?? null;
    } catch {
      throw new Error("Could not read saved changes. The existing queue has been kept.");
    }
  },

  async save(state: OutboxState): Promise<void> {
    try {
      // Structured clone requires plain data; state is JSON-safe by contract.
      await set(OUTBOX_STORAGE_KEY, JSON.parse(JSON.stringify(state)));
    } catch (error) {
      // A mutation is not saved until it is durable. Let callers retain the draft.
      Sentry.addBreadcrumb({
        category: "outbox",
        message: "Failed to persist outbox state",
        level: "warning",
        data: { error: error instanceof Error ? error.message : String(error) },
      });
      throw new Error("Could not save on this device. Free up storage and try again.");
    }
  },
};

/** Remove the persisted queue (sign-out). */
export async function clearOutboxStorage(): Promise<void> {
  try {
    await del(OUTBOX_STORAGE_KEY);
  } catch {
    // Best-effort; the auth listener re-clears on the next sign-out.
  }
}
