import { get, set } from "idb-keyval";
import {
  createAccountOutboxStorage,
  parseOutboxState,
  type OutboxStorageAdapter,
} from "@template/shared";

export function outboxStorageFor(ownerId: string): OutboxStorageAdapter {
  return createAccountOutboxStorage(process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "", ownerId, {
    get: async (key): Promise<unknown> => (await get<unknown>(key)) ?? null,
    set: async (key, value): Promise<void> => set(key, value),
  });
}

/** Retain unowned queues from older releases without displaying their private contents. */
export async function hasLegacyOutbox(): Promise<boolean> {
  const raw = await get<unknown>("settleup-outbox");
  try {
    return parseOutboxState(raw).entries.length > 0;
  } catch {
    return true;
  }
}
