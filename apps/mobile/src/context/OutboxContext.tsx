import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, Text, View } from "react-native";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react-native";
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
import { hasLegacyOutbox, outboxStorageFor, withOutboxLock } from "@/lib/outbox/storage";
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
      ["categories", groupId],
      ["comments", groupId],
    );
  }
  return keys;
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
  const toast = useToast();
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
                    process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
                    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
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
    if (!engine || !ownerId || !isActive() || !onlineManager.isOnline()) return;
    try {
      const groupIds = new Set<string>();
      const result = await withOutboxLock(ownerId, async () => {
        requireAccount();
        await engine.init();
        for (const entry of engine.getState().entries) groupIds.add(entry.groupId);
        return engine.drain();
      });
      if (!isActive()) return;
      setStorageError(null);

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
    } catch {
      if (!isActive()) return;
      setStorageError(
        "Offline sync is paused. Your saved changes are kept. Retry when device storage is available.",
      );
      toast.error(
        "Offline sync paused. Saved changes have been kept; try again when storage is available.",
      );
    }
  }, [engine, queryClient, toast, ownerId, isActive, requireAccount]);

  // Boot: restore the persisted queue (interrupted sends requeue), then try
  // to drain whatever survived a crash or kill.
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
        toast.error("Saved changes could not be read. Your queue has been kept.");
      });
  }, [engine, drain, toast, ownerId, requireAccount, isActive]);

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
      requireAccount();
      if (!engine || !ownerId) throw new Error("Sign in to save offline changes.");
      await withOutboxLock(ownerId, async () => {
        requireAccount();
        await engine.init();
        await engine.enqueue(input);
      });
      if (onlineManager.isOnline()) {
        void drain();
      } else {
        toast.info("Saved offline — will sync when you're back online");
      }
    },
    [engine, drain, toast, ownerId, requireAccount],
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
    () => ({ entries: state.entries, enqueue, retry, discard, drain }),
    [state.entries, enqueue, retry, discard, drain],
  );

  return (
    <OutboxContext.Provider value={value}>
      {ownerId && (storageError || legacyPending) && (
        <View accessibilityRole="alert" style={{ padding: 12, backgroundColor: "#fffbeb" }}>
          <Text style={{ color: "#78350f" }}>
            {storageError ??
              "Changes from an older app version are still saved on this device. Their account could not be identified. Contact support before clearing app data."}
          </Text>
        </View>
      )}
      {children}
    </OutboxContext.Provider>
  );
}

export function useOutbox(): OutboxContextValue {
  const ctx = useContext(OutboxContext);
  if (!ctx) throw new Error("useOutbox must be used within <OutboxProvider>");
  return ctx;
}
