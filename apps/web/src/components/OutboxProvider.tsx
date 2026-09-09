"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/nextjs";
import { toast } from "sonner";
import {
  createEmptyOutboxState,
  createAccountOutboxExecutor,
  type OutboxIdentity,
  createSyncEngine,
  type NewOutboxEntry,
  type OutboxEntry,
  type OutboxState,
} from "@template/shared";
import { createTokenClient } from "@template/supabase";
import { createOutboxExecutor } from "@/lib/outbox/executor";
import { hasLegacyOutbox, outboxStorageFor } from "@/lib/outbox/storage";
import { requestPersistentStorage } from "@/lib/pwa/storage";
import { supabase } from "@/lib/supabase/client";
import { invalidationKeysFor, stampLocalInvalidate } from "@/lib/query-keys";

// ---------------------------------------------------------------------------
// Web offline outbox provider.
//
// Drains on: reconnect (`online`), tab becoming visible, mount, right after
// an enqueue while online, and a timer armed to the earliest scheduled
// backoff retry. Every operation runs inside a Web Locks exclusive section
// keyed on the queue, with the engine re-initialized from IndexedDB first —
// so multiple open tabs never clobber each other's entries and at most one
// tab drains at a time. After a drain that synced anything, the affected
// groups' queries are invalidated — cheap parallel background refetches.
// ---------------------------------------------------------------------------

type OutboxContextValue = {
  entries: OutboxEntry[];
  enqueue: (input: NewOutboxEntry) => Promise<void>;
  enqueueBatch: (inputs: NewOutboxEntry[]) => Promise<void>;
  retry: (id: string) => Promise<void>;
  discard: (id: string) => Promise<void>;
};

const OutboxContext = createContext<OutboxContextValue | null>(null);

/** Do not risk cross-tab overwrites when exclusive browser locks are unavailable. */
async function withOutboxLock<T>(ownerId: string, fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && "locks" in navigator) {
    return navigator.locks.request(`tabkind-outbox:${ownerId}`, fn);
  }
  throw new Error(
    "This browser cannot safely store offline changes. Use an updated browser and keep your draft open.",
  );
}

export function OutboxProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const identityRef = useRef<OutboxIdentity | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const getIdentity = useCallback(() => identityRef.current, []);
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      identityRef.current = session
        ? { userId: session.user.id, accessToken: session.access_token }
        : null;
      setOwnerId(session?.user.id ?? null);
    });
    return () => {
      identityRef.current = null;
      subscription.unsubscribe();
    };
  }, []);
  return (
    <AccountOutboxProvider
      key={ownerId ?? "signed-out"}
      ownerId={ownerId}
      getIdentity={getIdentity}
    >
      {children}
    </AccountOutboxProvider>
  );
}

type AccountOutboxProps = {
  children: React.ReactNode;
  ownerId: string | null;
  getIdentity: () => OutboxIdentity | null;
};

function AccountOutboxProvider({
  children,
  ownerId,
  getIdentity,
}: AccountOutboxProps): React.ReactElement {
  const queryClient = useQueryClient();
  const activeRef = useRef(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [legacyPending, setLegacyPending] = useState(false);
  const isActive = useCallback(
    (): boolean => activeRef.current && ownerId !== null && getIdentity()?.userId === ownerId,
    [getIdentity, ownerId],
  );
  const requireAccount = useCallback((): void => {
    if (!isActive()) throw new Error("Sign in to save changes to this account.");
  }, [isActive]);
  useEffect(() => {
    activeRef.current = true;
    if (ownerId)
      void hasLegacyOutbox()
        .then((pending) => {
          if (activeRef.current) setLegacyPending(pending);
        })
        .catch(() => {
          if (activeRef.current)
            setStorageError("Saved changes could not be read. They have been kept on this device.");
        });
    return () => {
      activeRef.current = false;
    };
  }, [ownerId]);
  const [state, setState] = useState<OutboxState>(createEmptyOutboxState());
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const engine = useMemo(
    () =>
      ownerId
        ? createSyncEngine({
            storage: outboxStorageFor(ownerId),
            executor: createAccountOutboxExecutor(
              ownerId,
              () => (isActive() ? getIdentity() : null),
              (token) =>
                createOutboxExecutor(
                  createTokenClient(
                    process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "",
                    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? "",
                    token,
                  ),
                ),
            ),
            onChange: (next) => {
              if (isActive()) setState(next);
            },
            onEntryFailed: (entry) =>
              Sentry.addBreadcrumb({
                category: "outbox",
                message: `Entry failed: ${entry.kind}`,
                level: "warning",
                data: { code: entry.lastError?.code ?? null },
              }),
          })
        : null,
    [ownerId, getIdentity, isActive],
  );

  const drain = useCallback(async (): Promise<void> => {
    if (!engine || !ownerId || !isActive() || !navigator.onLine) return;
    try {
      const groupIds = new Set<string>();
      const result = await withOutboxLock(ownerId, async () => {
        requireAccount();
        await engine.init(); // pick up entries persisted by other tabs
        const entries = engine.getState().entries;
        if (entries.length === 0) return null;
        for (const entry of entries) groupIds.add(entry.groupId);
        return engine.drain();
      });
      if (!isActive()) return;
      setStorageError(null);
      if (result) {
        if (result.synced > 0) {
          // Stamp before invalidating so the realtime echo of our own replayed
          // writes doesn't trigger a second refetch wave.
          for (const groupId of groupIds) stampLocalInvalidate(groupId);
          for (const key of invalidationKeysFor(groupIds)) {
            void queryClient.invalidateQueries({ queryKey: key });
          }
          toast.success(
            `Synced ${result.synced} offline ${result.synced === 1 ? "change" : "changes"}`,
          );
        }
        if (result.failed > 0) {
          toast.error(
            `Couldn't sync ${result.failed} ${result.failed === 1 ? "change" : "changes"} — see pending changes`,
          );
        }
      }

      // Arm a wake-up for the earliest scheduled backoff retry, if any.
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      const nextAttemptAt = engine.earliestNextAttemptAt();
      if (nextAttemptAt) {
        const delay = Math.max(1_000, new Date(nextAttemptAt).getTime() - Date.now());
        retryTimerRef.current = setTimeout(() => void drain(), delay);
      }
    } catch {
      if (!isActive()) return;
      setStorageError(
        "Offline sync is paused. Your saved changes are kept. Retry when device storage is available.",
      );
      toast.error(
        "Offline sync paused. Saved changes have been kept; try again when storage is available.",
        { id: "outbox-storage-error", duration: 10000 },
      );
    }
  }, [engine, queryClient, ownerId, isActive, requireAccount]);

  useEffect(() => {
    if (!engine || !ownerId) return;
    void withOutboxLock(ownerId, async () => {
      requireAccount();
      return engine.init();
    })
      .then(() => void drain())
      .catch(() => {
        if (!isActive()) return;
        setStorageError("Saved changes could not be read. They have been kept on this device.");
        toast.error("Saved changes could not be read. Your queue has been kept.", {
          id: "outbox-storage-error",
        });
      });

    const onOnline = (): void => void drain();
    const onVisible = (): void => {
      if (document.visibilityState === "visible") void drain();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [engine, drain, ownerId, requireAccount, isActive]);

  const enqueue = useCallback(
    async (input: NewOutboxEntry): Promise<void> => {
      requireAccount();
      if (!engine || !ownerId) throw new Error("Sign in to save offline changes.");
      await withOutboxLock(ownerId, async () => {
        requireAccount();
        await engine.init();
        await engine.enqueue(input);
      });
      // Pending writes are critical app data. Ask the browser to exempt the
      // IndexedDB queue and runtime caches from automatic storage eviction.
      void requestPersistentStorage();
      // Call sites own the offline feedback toast (a batch enqueues several
      // entries but should announce once).
      if (navigator.onLine) void drain();
    },
    [engine, drain, ownerId, requireAccount],
  );

  const retry = useCallback(
    async (id: string): Promise<void> => {
      requireAccount();
      if (!engine || !ownerId) throw new Error("Sign in to review offline changes.");
      await withOutboxLock(ownerId, async () => {
        requireAccount();
        await engine.init();
        await engine.retry(id);
      });
      void drain();
    },
    [engine, drain, ownerId, requireAccount],
  );

  const enqueueBatch = useCallback(
    async (inputs: NewOutboxEntry[]): Promise<void> => {
      requireAccount();
      if (!engine || !ownerId) throw new Error("Sign in to save offline changes.");
      await withOutboxLock(ownerId, async () => {
        requireAccount();
        await engine.init();
        await engine.enqueueBatch(inputs);
      });
      void drain();
    },
    [engine, drain, ownerId, requireAccount],
  );

  const discard = useCallback(
    async (id: string): Promise<void> => {
      requireAccount();
      if (!engine || !ownerId) throw new Error("Sign in to review offline changes.");
      await withOutboxLock(ownerId, async () => {
        requireAccount();
        await engine.init();
        await engine.discard(id);
      });
    },
    [engine, ownerId, requireAccount],
  );

  const value = useMemo(
    () => ({ entries: state.entries, enqueue, enqueueBatch, retry, discard }),
    [state.entries, enqueue, enqueueBatch, retry, discard],
  );

  return (
    <OutboxContext.Provider value={value}>
      {ownerId && (storageError || legacyPending) && (
        <div
          role="status"
          className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {storageError ??
            "Changes from an older app version are still saved on this device. Their account could not be identified. Contact support before clearing app data."}
          {storageError && (
            <button type="button" className="ml-3 underline" onClick={() => void drain()}>
              Retry sync
            </button>
          )}
        </div>
      )}
      {children}
    </OutboxContext.Provider>
  );
}

export function useWebOutbox(): OutboxContextValue {
  const ctx = useContext(OutboxContext);
  if (!ctx) throw new Error("useWebOutbox must be used within <OutboxProvider>");
  return ctx;
}
