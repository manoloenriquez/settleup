import { del, get, set } from "idb-keyval";
import * as Sentry from "@sentry/nextjs";
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
    try {
      // Structured clone requires plain data; state is JSON-safe by contract.
      await set(OUTBOX_STORAGE_KEY, JSON.parse(JSON.stringify(state)));
    } catch (error) {
      // Quota/eviction: the in-memory queue keeps working this session; only
      // crash-persistence degrades. Surface a breadcrumb, never a throw into
      // the enqueue caller.
      Sentry.addBreadcrumb({
        category: "outbox",
        message: "Failed to persist outbox state",
        level: "warning",
        data: { error: error instanceof Error ? error.message : String(error) },
      });
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
