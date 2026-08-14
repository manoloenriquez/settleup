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
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/nextjs";
import { toast } from "sonner";
import {
  createEmptyOutboxState,
  createSyncEngine,
  OUTBOX_UPDATE_KINDS,
  type NewOutboxEntry,
  type OutboxEntry,
  type OutboxState,
  type SyncEngine,
} from "@template/shared";
import { outboxExecutor } from "@/lib/outbox/executor";
import { clearOutboxStorage, outboxStorage } from "@/lib/outbox/storage";
import { supabase } from "@/lib/supabase/client";
import { invalidationKeysFor } from "@/lib/query-keys";

// ---------------------------------------------------------------------------
// Web offline outbox provider.
//
// Drains on: reconnect (`online`), tab becoming visible, mount, right after
// an enqueue while online, and a timer armed to the earliest scheduled
// backoff retry. Every operation runs inside a Web Locks exclusive section
// keyed on the queue, with the engine re-initialized from IndexedDB first —
// so multiple open tabs never clobber each other's entries and at most one
// tab drains at a time. After a drain that synced anything, the affected
// groups' queries are invalidated (and the RSC tree refreshed for
// still-server-rendered pages).
// ---------------------------------------------------------------------------

type OutboxContextValue = {
  entries: OutboxEntry[];
  enqueue: (input: NewOutboxEntry) => Promise<void>;
  retry: (id: string) => Promise<void>;
  discard: (id: string) => Promise<void>;
};

const OutboxContext = createContext<OutboxContextValue | null>(null);

/** Serialize an outbox operation across tabs; falls back to direct call. */
async function withOutboxLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && "locks" in navigator) {
    return navigator.locks.request("settleup-outbox", fn);
  }
  return fn();
}

export function OutboxProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [state, setState] = useState<OutboxState>(createEmptyOutboxState());
  const engineRef = useRef<SyncEngine | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (engineRef.current === null) {
    engineRef.current = createSyncEngine({
      storage: outboxStorage,
      executor: outboxExecutor,
      onChange: setState,
      onEntryFailed: (entry) => {
        Sentry.addBreadcrumb({
          category: "outbox",
          message: `Entry failed terminally: ${entry.kind}`,
          level: "warning",
          data: { code: entry.lastError?.code ?? null },
        });
      },
    });
  }
  const engine = engineRef.current;

  const drain = useCallback(async (): Promise<void> => {
    if (!navigator.onLine) return;
    const groupIds = new Set<string>();
    const result = await withOutboxLock(async () => {
      await engine.init(); // pick up entries persisted by other tabs
      const entries = engine.getState().entries;
      if (entries.length === 0) return null;
      for (const entry of entries) groupIds.add(entry.groupId);
      return engine.drain();
    });
    if (result) {
      if (result.synced > 0) {
        for (const key of invalidationKeysFor(groupIds)) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
        // Unconverted pages (settings, activity) still read via RSC.
        router.refresh();
        toast.success(`Synced ${result.synced} offline ${result.synced === 1 ? "change" : "changes"}`);
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
  }, [engine, queryClient, router]);

  useEffect(() => {
    void withOutboxLock(() => engine.init()).then(() => void drain());

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
  }, [engine, drain]);

  // Queued writes belong to the account that made them.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        void withOutboxLock(async () => {
          await engine.clear();
          await clearOutboxStorage();
        });
      }
    });
    return () => subscription.unsubscribe();
  }, [engine]);

  const enqueue = useCallback(
    async (input: NewOutboxEntry): Promise<void> => {
      await withOutboxLock(async () => {
        await engine.init();
        await engine.enqueue(input);
      });
      // Call sites own the offline feedback toast (a batch enqueues several
      // entries but should announce once).
      if (navigator.onLine) void drain();
    },
    [engine, drain],
  );

  const retry = useCallback(
    async (id: string): Promise<void> => {
      await withOutboxLock(async () => {
        await engine.init();
        // Retrying a CAS-conflicted edit is the user explicitly choosing
        // "reapply my change on top of the latest server state" — drop the
        // stale snapshot so the replay doesn't just conflict again.
        const entry = engine.getState().entries.find((e) => e.id === id);
        if (
          entry &&
          entry.lastError?.class === "conflict" &&
          OUTBOX_UPDATE_KINDS.has(entry.kind) &&
          entry.payload !== null &&
          typeof entry.payload === "object" &&
          !Array.isArray(entry.payload)
        ) {
          const { expected_updated_at: _stale, ...payload } = entry.payload;
          await engine.discard(id);
          await engine.enqueue({
            id: entry.id,
            kind: entry.kind,
            entityId: entry.entityId,
            groupId: entry.groupId,
            payload,
            createdAt: entry.createdAt,
            summary: entry.summary,
          });
        } else {
          await engine.retry(id);
        }
      });
      void drain();
    },
    [engine, drain],
  );

  const discard = useCallback(
    async (id: string): Promise<void> => {
      await withOutboxLock(async () => {
        await engine.init();
        await engine.discard(id);
      });
    },
    [engine],
  );

  const value = useMemo(
    () => ({ entries: state.entries, enqueue, retry, discard }),
    [state.entries, enqueue, retry, discard],
  );

  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
}

export function useWebOutbox(): OutboxContextValue {
  const ctx = useContext(OutboxContext);
  if (!ctx) throw new Error("useWebOutbox must be used within <OutboxProvider>");
  return ctx;
}
