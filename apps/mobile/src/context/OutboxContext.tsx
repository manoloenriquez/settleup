import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react-native";
import {
  createEmptyOutboxState,
  createSyncEngine,
  type NewOutboxEntry,
  type OutboxEntry,
  type OutboxState,
} from "@template/shared";
import { outboxExecutor } from "@/lib/outbox/executor";
import { clearOutboxStorage, outboxStorage } from "@/lib/outbox/storage";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";

// ---------------------------------------------------------------------------
// Offline outbox provider
//
// Owns the sync engine instance and decides when to drain:
//   - connectivity returns (onlineManager transition to online)
//   - app returns to the foreground
//   - right after an enqueue while online (covers flaky-network retries)
//   - a timer armed to the earliest scheduled backoff retry
//
// After a drain that synced anything, the React Query caches of the affected
// groups are invalidated — the standard post-mutation invalidation set.
// ---------------------------------------------------------------------------

type OutboxContextValue = {
  /** Current queue, for pending badges and the Pending Changes sheet. */
  entries: OutboxEntry[];
  /** Queue a write for replay. Returns after the entry is persisted. */
  enqueue: (input: NewOutboxEntry) => Promise<void>;
  retry: (id: string) => Promise<void>;
  discard: (id: string) => Promise<void>;
  drain: () => Promise<void>;
};

const OutboxContext = createContext<OutboxContextValue | null>(null);

function invalidationKeysFor(groupIds: Set<string>): (string | undefined)[][] {
  const keys: (string | undefined)[][] = [["dashboard"], ["groups"]];
  for (const groupId of groupIds) {
    keys.push(
      ["expenses", groupId],
      ["expense-totals", groupId],
      ["balances", groupId],
      ["activity", groupId],
      ["pending-payments", groupId],
      ["comments", groupId],
    );
  }
  return keys;
}

export function OutboxProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [state, setState] = useState<OutboxState>(createEmptyOutboxState());
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const engine = useMemo(
    () =>
      createSyncEngine({
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
      }),
    [],
  );

  const drain = useCallback(async (): Promise<void> => {
    if (!onlineManager.isOnline()) return;
    const before = engine.getState().entries;
    if (before.length === 0) return;
    const groupIds = new Set(before.map((e) => e.groupId));

    const result = await engine.drain();

    if (result.synced > 0) {
      for (const key of invalidationKeysFor(groupIds)) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      toast.success(
        `Synced ${result.synced} offline ${result.synced === 1 ? "change" : "changes"}`,
      );
    }
    if (result.failed > 0) {
      toast.error(
        `Couldn't sync ${result.failed} ${result.failed === 1 ? "change" : "changes"} — tap the banner to review`,
      );
    }

    // Arm a wake-up for the earliest scheduled backoff retry, if any.
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    const nextAttemptAt = engine.earliestNextAttemptAt();
    if (nextAttemptAt) {
      const delay = Math.max(1_000, new Date(nextAttemptAt).getTime() - Date.now());
      retryTimerRef.current = setTimeout(() => void drain(), delay);
    }
  }, [engine, queryClient, toast]);

  // Boot: restore the persisted queue (interrupted sends requeue), then try
  // to drain whatever survived a crash or kill.
  useEffect(() => {
    void engine.init().then(() => void drain());
  }, [engine, drain]);

  // Sign-out drops the queue (in memory and on disk): queued writes belong
  // to the account that made them and must not replay under another login.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        void engine.clear().then(() => clearOutboxStorage());
      }
    });
    return () => subscription.unsubscribe();
  }, [engine]);

  // Drain on reconnect and on app foreground.
  useEffect(() => {
    const unsubscribeOnline = onlineManager.subscribe((online) => {
      if (online) void drain();
    });
    const appStateSubscription = AppState.addEventListener("change", (status) => {
      if (status === "active") void drain();
    });
    return () => {
      unsubscribeOnline();
      appStateSubscription.remove();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [drain]);

  const enqueue = useCallback(
    async (input: NewOutboxEntry): Promise<void> => {
      await engine.enqueue(input);
      if (onlineManager.isOnline()) {
        void drain();
      } else {
        toast.info("Saved offline — will sync when you're back online");
      }
    },
    [engine, drain, toast],
  );

  const retry = useCallback(
    async (id: string): Promise<void> => {
      // Retrying a CAS-conflicted edit is the user explicitly choosing
      // "reapply my change on top of the latest server state" — drop the
      // stale snapshot so the replay doesn't just conflict again.
      const entry = engine.getState().entries.find((e) => e.id === id);
      if (
        entry &&
        entry.lastError?.class === "conflict" &&
        (entry.kind === "expense.update" || entry.kind === "expense.update_itemized") &&
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
      void drain();
    },
    [engine, drain],
  );

  const discard = useCallback(
    async (id: string): Promise<void> => {
      await engine.discard(id);
    },
    [engine],
  );

  const value = useMemo(
    () => ({ entries: state.entries, enqueue, retry, discard, drain }),
    [state.entries, enqueue, retry, discard, drain],
  );

  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
}

export function useOutbox(): OutboxContextValue {
  const ctx = useContext(OutboxContext);
  if (!ctx) throw new Error("useOutbox must be used within <OutboxProvider>");
  return ctx;
}

/** Sign-out cleanup: drop the queue in memory and on disk. */
export { clearOutboxStorage };
