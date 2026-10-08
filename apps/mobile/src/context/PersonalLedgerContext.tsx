import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { onlineManager } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import {
  addPersonalExpense,
  applyPushResults,
  deletePersonalExpense,
  emptyPersonalLedger,
  guestImportComplete,
  importGuestExpenses,
  pullCursor,
  mergePulledRows,
  pendingPersonalExpenses,
  restorePersonalExpense,
  toPushRow,
  unimportedGuestExpenses,
  updatePersonalExpense,
  visiblePersonalExpenses,
  type PersonalExpense,
  type PersonalExpenseInput,
  type PersonalLedgerState,
  type PersonalWriteContext,
} from "@template/shared";
import { useAuth } from "@/context/AuthContext";
import {
  GUEST_PERSONAL_KEY,
  loadPersonalLedger,
  personalStoreKey,
  removePersonalLedger,
  savePersonalLedger,
} from "@/lib/personal/storage";
import { pullPersonalExpenses, pushPersonalExpenses } from "@/services/personal";

// ---------------------------------------------------------------------------
// The personal ledger for whoever is using the app right now: the guest store
// when signed out, the account's own store when signed in. Every write is
// persisted before the UI state changes, and writes are serialized so two
// quick taps can never overwrite each other.
//
// Signed in, the device store is still the source of truth for the screen; a
// sync loop uploads pending records and pulls other devices' changes. Guest
// expenses join an account only when the person says so, and the guest copy
// is removed only after the server has acknowledged every one of them.
// ---------------------------------------------------------------------------

type Status = "loading" | "ready" | "error";
export type SyncStatus = "local" | "idle" | "syncing" | "offline" | "error";

type PersonalLedgerContextValue = {
  status: Status;
  error: string | null;
  /** Live expenses, newest first. */
  expenses: PersonalExpense[];
  ledger: PersonalLedgerState;
  add: (input: PersonalExpenseInput) => Promise<string>;
  update: (id: string, input: PersonalExpenseInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  reload: () => void;
  /** "local" for guests (nothing to sync). */
  syncStatus: SyncStatus;
  syncError: string | null;
  /** Records not yet acknowledged by the server. */
  pendingCount: number;
  syncNow: () => Promise<void>;
  /** Guest expenses on this device that are not in the signed-in account yet. */
  guestExpenseCount: number;
  importGuestExpenses: () => Promise<void>;
};

const PersonalLedgerContext = createContext<PersonalLedgerContextValue | null>(null);

export function PersonalLedgerProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { session } = useAuth();
  const ownerId = session?.user.id ?? null;
  // Re-mount per owner so no state can leak from one account (or the guest) to another.
  return (
    <OwnerLedgerProvider key={ownerId ?? "guest"} ownerId={ownerId}>
      {children}
    </OwnerLedgerProvider>
  );
}

const SYNC_DEBOUNCE_MS = 1_500;
const MAX_BACKOFF_MS = 5 * 60_000;

function OwnerLedgerProvider({
  ownerId,
  children,
}: {
  ownerId: string | null;
  children: React.ReactNode;
}): React.ReactElement {
  const key = personalStoreKey(ownerId);
  const signedIn = ownerId !== null;
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [ledger, setLedger] = useState<PersonalLedgerState>(emptyPersonalLedger);
  const [guest, setGuest] = useState<PersonalLedgerState | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(signedIn ? "idle" : "local");
  const [syncError, setSyncError] = useState<string | null>(null);
  const latest = useRef<PersonalLedgerState | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [loadCount, setLoadCount] = useState(0);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    setStatus("loading");
    Promise.all([loadPersonalLedger(key), signedIn ? loadPersonalLedger(GUEST_PERSONAL_KEY).catch(() => null) : null])
      .then(([state, guestState]) => {
        if (!current) return;
        latest.current = state;
        setLedger(state);
        setGuest(guestState);
        setStatus("ready");
        setError(null);
      })
      .catch((e: unknown) => {
        if (!current) return;
        latest.current = null;
        setError(e instanceof Error ? e.message : "Saved expenses could not be read.");
        setStatus("error");
      });
    return () => {
      current = false;
    };
  }, [key, signedIn, loadCount]);

  const write = useCallback(
    <T,>(
      change: (
        state: PersonalLedgerState,
        ctx: PersonalWriteContext,
      ) => { state: PersonalLedgerState; result: T },
    ) => {
      const run = queue.current.then(async () => {
        const current = latest.current;
        if (!current) throw new Error("Your expenses are still loading. Try again in a moment.");
        const ctx = { now: new Date().toISOString(), tracksSync: signedIn };
        const { state, result } = change(current, ctx);
        await savePersonalLedger(key, state);
        latest.current = state;
        if (active.current) setLedger(state);
        return result;
      });
      queue.current = run.catch(() => undefined);
      return run;
    },
    [key, signedIn],
  );

  // ---- Sync (signed-in only) ------------------------------------------------

  const syncing = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failures = useRef(0);

  const syncNow = useCallback(async (): Promise<void> => {
    if (!signedIn || syncing.current || !latest.current || !active.current) return;
    if (!onlineManager.isOnline()) {
      setSyncStatus("offline");
      return;
    }
    syncing.current = true;
    setSyncStatus("syncing");
    try {
      // Upload everything pending, in batches.
      for (let round = 0; round < 50; round++) {
        const batch = latest.current ? pendingPersonalExpenses(latest.current, 50) : [];
        if (batch.length === 0) break;
        const pushed = await pushPersonalExpenses(batch.map(toPushRow));
        if (pushed.error !== null) throw new Error(pushed.error);
        await write((state) => ({ state: applyPushResults(state, batch, pushed.data), result: undefined }));
      }
      // Then take other devices' changes.
      const since = latest.current ? pullCursor(latest.current) : null;
      const pulled = await pullPersonalExpenses(since);
      if (pulled.error !== null) throw new Error(pulled.error);
      if (pulled.data.length > 0) {
        await write((state) => ({ state: mergePulledRows(state, pulled.data), result: undefined }));
      }
      // The guest copy goes only once the server holds every guest expense.
      const guestState = await loadPersonalLedger(GUEST_PERSONAL_KEY).catch(() => null);
      if (guestState && guestState.expenses.length > 0 && latest.current) {
        const imported = unimportedGuestExpenses(guestState, latest.current).length === 0;
        if (imported && guestImportComplete(guestState, latest.current)) {
          await removePersonalLedger(GUEST_PERSONAL_KEY);
          if (active.current) setGuest(null);
        }
      }
      failures.current = 0;
      if (active.current) {
        setSyncError(null);
        setSyncStatus("idle");
      }
      // Edits made while this pass was pulling go out on the next one.
      if (active.current && latest.current && pendingPersonalExpenses(latest.current, 1).length > 0) {
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => void syncNow(), SYNC_DEBOUNCE_MS);
      }
    } catch (e) {
      if (!active.current) return;
      failures.current += 1;
      const delay = Math.min(2_000 * 2 ** failures.current, MAX_BACKOFF_MS);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => void syncNow(), delay);
      if (active.current) {
        setSyncError(e instanceof Error ? e.message : "Sync failed.");
        setSyncStatus(onlineManager.isOnline() ? "error" : "offline");
      }
    } finally {
      syncing.current = false;
    }
  }, [signedIn, write]);

  const scheduleSync = useCallback(() => {
    if (!signedIn) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => void syncNow(), SYNC_DEBOUNCE_MS);
  }, [signedIn, syncNow]);

  useEffect(() => {
    if (!signedIn || status !== "ready") return;
    void syncNow();
    const unsubscribeOnline = onlineManager.subscribe((online) => {
      if (online) void syncNow();
      else setSyncStatus("offline");
    });
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") void syncNow();
    });
    return () => {
      unsubscribeOnline();
      appState.remove();
      if (retryTimer.current) clearTimeout(retryTimer.current);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [signedIn, status, syncNow]);

  // ---- Public API ------------------------------------------------------------

  const mutate = useCallback(
    async <T,>(
      change: (state: PersonalLedgerState, ctx: PersonalWriteContext) => { state: PersonalLedgerState; result: T },
    ): Promise<T> => {
      const result = await write(change);
      scheduleSync();
      return result;
    },
    [write, scheduleSync],
  );

  const importGuest = useCallback(async (): Promise<void> => {
    if (!signedIn) return;
    const guestState = await loadPersonalLedger(GUEST_PERSONAL_KEY);
    await write((state) => ({ state: importGuestExpenses(state, guestState), result: undefined }));
    setGuest(guestState);
    await syncNow();
  }, [signedIn, write, syncNow]);

  const value = useMemo<PersonalLedgerContextValue>(() => {
    const pendingCount = ledger.expenses.filter((expense) => expense.sync === "pending").length;
    return {
      status,
      error,
      ledger,
      expenses: visiblePersonalExpenses(ledger),
      add: (input) =>
        mutate((state, ctx) => {
          const id = Crypto.randomUUID();
          return { state: addPersonalExpense(state, id, input, ctx), result: id };
        }),
      update: (id, input) =>
        mutate((state, ctx) => ({ state: updatePersonalExpense(state, id, input, ctx), result: undefined })),
      remove: (id) =>
        mutate((state, ctx) => ({ state: deletePersonalExpense(state, id, ctx), result: undefined })),
      restore: (id) =>
        mutate((state, ctx) => ({ state: restorePersonalExpense(state, id, ctx), result: undefined })),
      reload: () => setLoadCount((count) => count + 1),
      syncStatus,
      syncError,
      pendingCount,
      syncNow,
      guestExpenseCount: signedIn && guest ? unimportedGuestExpenses(guest, ledger).length : 0,
      importGuestExpenses: importGuest,
    };
  }, [status, error, ledger, mutate, syncStatus, syncError, syncNow, signedIn, guest, importGuest]);

  return <PersonalLedgerContext.Provider value={value}>{children}</PersonalLedgerContext.Provider>;
}

export function usePersonalLedger(): PersonalLedgerContextValue {
  const context = useContext(PersonalLedgerContext);
  if (!context) throw new Error("usePersonalLedger must be used within <PersonalLedgerProvider>");
  return context;
}
