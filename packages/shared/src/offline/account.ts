import { z } from "zod";
import { parseOutboxState } from "./outbox";
import type { OutboxExecutor, OutboxStorageAdapter } from "./types";

export type OutboxIdentity = { userId: string; accessToken: string };

export type OutboxKeyValueStorage = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
};

const envelopeSchema = z.object({
  version: z.literal(2),
  ownerId: z.string().min(1),
  state: z.unknown(),
});

export function accountOutboxKey(project: string, ownerId: string): string {
  if (!project || !ownerId)
    throw new Error("An account and project are required for offline storage.");
  return `tabkind:outbox:v2:${encodeURIComponent(project)}:${encodeURIComponent(ownerId)}`;
}

/** Never infer ownership of the old, unscoped queue from the current login. */
export function createAccountOutboxStorage(
  project: string,
  ownerId: string,
  storage: OutboxKeyValueStorage,
): OutboxStorageAdapter {
  const key = accountOutboxKey(project, ownerId);
  return {
    async load(): Promise<unknown> {
      const raw = await storage.get(key);
      if (raw === null || raw === undefined) return null;
      const parsed = envelopeSchema.safeParse(raw);
      if (!parsed.success || parsed.data.ownerId !== ownerId || parsed.data.state == null) {
        throw new Error(
          "Saved changes belong to a different account or app version. They have been kept on this device.",
        );
      }
      return parseOutboxState(parsed.data.state);
    },
    async save(state): Promise<void> {
      await storage.set(key, { version: 2, ownerId, state });
    },
  };
}

/** A request captures its owner's token before any asynchronous network work. */
export function createAccountOutboxExecutor(
  ownerId: string,
  getIdentity: () => OutboxIdentity | null,
  executorForToken: (accessToken: string) => OutboxExecutor,
): OutboxExecutor {
  return async (entry) => {
    const identity = getIdentity();
    if (!identity || identity.userId !== ownerId) {
      return {
        ok: false,
        code: "OUTBOX_PAUSED",
        message: "Sign in to the original account to sync these changes.",
      };
    }
    return executorForToken(identity.accessToken)(entry);
  };
}

/** Serializes mobile queue access, including old providers finishing after account switches. */
export function createOutboxLock(): <T>(key: string, operation: () => Promise<T>) => Promise<T> {
  const locks = new Map<string, Promise<void>>();
  return async <T>(key: string, operation: () => Promise<T>): Promise<T> => {
    const result = (locks.get(key) ?? Promise.resolve()).then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    locks.set(key, tail);
    try {
      return await result;
    } finally {
      if (locks.get(key) === tail) locks.delete(key);
    }
  };
}
