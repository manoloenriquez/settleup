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
import { toast } from "sonner";
import {
  createEmptyOutboxState,
  createSyncEngine,
  type NewOutboxEntry,
  type OutboxEntry,
  type OutboxState,
  type SyncEngine,
} from "@template/shared";
import { outboxExecutor } from "@/lib/outbox/executor";
import { clearOutboxStorage, outboxStorage } from "@/lib/outbox/storage";
import { supabase } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Web offline outbox provider.
//
// Drains on: reconnect (`online`), tab becoming visible, mount, and right
// after an enqueue while online. Every operation runs inside a Web Locks
// exclusive section keyed on the queue, with the engine re-initialized from
// IndexedDB first — so multiple open tabs never clobber each other's entries
// and at most one tab drains at a time. After a drain that synced anything,
// `router.refresh()` re-renders the RSC tree so the new rows appear in place.
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
  const [state, setState] = useState<OutboxState>(createEmptyOutboxState());
  const engineRef = useRef<SyncEngine | null>(null);

  if (engineRef.current === null) {
    engineRef.current = createSyncEngine({
      storage: outboxStorage,
      executor: outboxExecutor,
      onChange: setState,
    });
  }
  const engine = engineRef.current;

  const drain = useCallback(async (): Promise<void> => {
    if (!navigator.onLine) return;
    const result = await withOutboxLock(async () => {
      await engine.init(); // pick up entries persisted by other tabs
      if (engine.getState().entries.length === 0) return null;
      return engine.drain();
    });
    if (!result) return;
    if (result.synced > 0) {
      toast.success(`Synced ${result.synced} offline ${result.synced === 1 ? "change" : "changes"}`);
      router.refresh();
    }
    if (result.failed > 0) {
      toast.error(
        `Couldn't sync ${result.failed} ${result.failed === 1 ? "change" : "changes"} — see pending changes`,
      );
    }
  }, [engine, router]);

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
        await engine.retry(id);
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
