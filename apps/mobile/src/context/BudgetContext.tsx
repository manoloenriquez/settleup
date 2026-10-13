import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { onlineManager } from "@tanstack/react-query";
import {
  emptyBudgetStore,
  storeAfterSave,
  storeWithImportedGuest,
  storeWithLocalChange,
  storeWithServerCopy,
  type BudgetDocument,
  type BudgetStore,
} from "@template/shared";
import { useAuth } from "@/context/AuthContext";
import { GUEST_BUDGET_KEY, budgetStoreKey, loadBudgetStore, removeBudgetStore, saveBudgetStore } from "@/lib/budget/storage";
import { BudgetSyncUnavailable, fetchRemoteBudget, saveRemoteBudget } from "@/services/budget";

// ---------------------------------------------------------------------------
// The budget document for whoever is using the app: the guest's on this
// phone, or the signed-in account's. Like the personal ledger, every change
// is saved on the device before it shows, writes are serialized, and signed-in
// budgets sync in the background (compare-and-swap; conflicts merge local
// changes on top of the server copy, see packages/shared/src/budget/merge.ts).
// ---------------------------------------------------------------------------

type Status = "loading" | "ready" | "error";
/** "unavailable": this server can't store budgets yet; the budget stays on the phone. */
export type BudgetSyncStatus = "local" | "idle" | "syncing" | "offline" | "error" | "unavailable";

export type BudgetChange = (doc: BudgetDocument | null, now: string) => BudgetDocument;

type BudgetContextValue = {
  status: Status;
  error: string | null;
  doc: BudgetDocument | null;
  syncStatus: BudgetSyncStatus;
  syncError: string | null;
  /** Changed on this device and not yet on the server. */
  pending: boolean;
  /** Apply a change built from the current document; resolves with the saved document. */
  change: (change: BudgetChange) => Promise<BudgetDocument>;
  reload: () => void;
  syncNow: () => Promise<void>;
  /** A guest budget on this phone that can join this account (the account has none). */
  guestBudget: BudgetDocument | null;
  importGuestBudget: () => Promise<"imported" | "kept_account">;
};

const BudgetContext = createContext<BudgetContextValue | null>(null);

export function BudgetProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { session } = useAuth();
  const ownerId = session?.user.id ?? null;
  return (
    <OwnerBudgetProvider key={ownerId ?? "guest"} ownerId={ownerId}>
      {children}
    </OwnerBudgetProvider>
  );
}

const SYNC_DEBOUNCE_MS = 1_500;
const MAX_BACKOFF_MS = 5 * 60_000;
const MAX_MERGES_PER_PASS = 3;

function OwnerBudgetProvider({ ownerId, children }: { ownerId: string | null; children: React.ReactNode }): React.ReactElement {
  const key = budgetStoreKey(ownerId);
  const signedIn = ownerId !== null;
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [store, setStore] = useState<BudgetStore>(() => emptyBudgetStore(signedIn));
  const [guest, setGuest] = useState<BudgetDocument | null>(null);
  /** The server was checked and holds no budget for this account. */
  const [serverEmpty, setServerEmpty] = useState(false);
  const [syncStatus, setSyncStatus] = useState<BudgetSyncStatus>(signedIn ? "idle" : "local");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [loadCount, setLoadCount] = useState(0);
  const latest = useRef<BudgetStore | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
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
    Promise.all([
      loadBudgetStore(key, signedIn),
      signedIn ? loadBudgetStore(GUEST_BUDGET_KEY, false).catch(() => null) : null,
    ])
      .then(([state, guestStore]) => {
        if (!current) return;
        latest.current = state;
        setStore(state);
        setGuest(guestStore?.doc && !guestStore.doc.deletedAt ? guestStore.doc : null);
        setStatus("ready");
        setError(null);
      })
      .catch((e: unknown) => {
        if (!current) return;
        latest.current = null;
        setError(e instanceof Error ? e.message : "Your budget could not be read.");
        setStatus("error");
      });
    return () => {
      current = false;
    };
  }, [key, signedIn, loadCount]);

  const write = useCallback(
    <T,>(apply: (state: BudgetStore) => { state: BudgetStore; result: T }): Promise<T> => {
      const run = queue.current.then(async () => {
        const current = latest.current;
        if (!current) throw new Error("Your budget is still loading. Try again in a moment.");
        const { state, result } = apply(current);
        if (state !== current) await saveBudgetStore(key, state);
        latest.current = state;
        if (active.current) setStore(state);
        return result;
      });
      queue.current = run.catch(() => undefined);
      return run;
    },
    [key],
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
      const remote = await fetchRemoteBudget();
      await write((s) => ({ state: storeWithServerCopy(s, remote?.doc ?? null, remote?.updatedAt ?? null), result: undefined }));
      if (active.current) setServerEmpty(remote === null);
      for (let round = 0; round < MAX_MERGES_PER_PASS; round++) {
        const s = latest.current;
        if (!s?.doc || s.sync !== "pending") break;
        const sent = s.doc;
        const saved = await saveRemoteBudget(sent, s.serverUpdatedAt);
        if (saved.status === "saved") {
          await write((now) => ({ state: storeAfterSave(now, sent, saved.updatedAt), result: undefined }));
          if (active.current) setServerEmpty(false);
        } else {
          await write((now) => ({ state: storeWithServerCopy(now, saved.doc, saved.updatedAt), result: undefined }));
        }
      }
      // The guest copy goes only once the server holds that same budget.
      const guestStore = await loadBudgetStore(GUEST_BUDGET_KEY, false).catch(() => null);
      if (guestStore?.doc && latest.current?.base?.id === guestStore.doc.id) {
        await removeBudgetStore(GUEST_BUDGET_KEY);
        if (active.current) setGuest(null);
      }
      failures.current = 0;
      if (active.current) {
        setSyncError(null);
        setSyncStatus(latest.current?.sync === "pending" ? "error" : "idle");
      }
    } catch (e) {
      if (!active.current) return;
      if (e instanceof BudgetSyncUnavailable) {
        setSyncError(e.message);
        setSyncStatus("unavailable");
        return;
      }
      failures.current += 1;
      const delay = Math.min(2_000 * 2 ** failures.current, MAX_BACKOFF_MS);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => void syncNow(), delay);
      setSyncError(e instanceof Error ? e.message : "Budget sync failed.");
      setSyncStatus(onlineManager.isOnline() ? "error" : "offline");
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
    const unsubscribe = onlineManager.subscribe((online) => {
      if (online) void syncNow();
      else setSyncStatus("offline");
    });
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") void syncNow();
    });
    return () => {
      unsubscribe();
      appState.remove();
      if (retryTimer.current) clearTimeout(retryTimer.current);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [signedIn, status, syncNow]);

  // ---- Public API ------------------------------------------------------------

  const change = useCallback(
    async (apply: BudgetChange): Promise<BudgetDocument> => {
      const doc = await write((s) => {
        const next = apply(s.doc, new Date().toISOString());
        return { state: storeWithLocalChange(s, next), result: next };
      });
      scheduleSync();
      return doc;
    },
    [write, scheduleSync],
  );

  const importGuestBudget = useCallback(async (): Promise<"imported" | "kept_account"> => {
    const guestStore = await loadBudgetStore(GUEST_BUDGET_KEY, false);
    const guestDoc = guestStore.doc;
    if (!signedIn || !guestDoc) return "kept_account";
    await write((s) => ({ state: storeWithImportedGuest(s, guestDoc), result: undefined }));
    await syncNow();
    return latest.current?.doc?.id === guestDoc.id ? "imported" : "kept_account";
  }, [signedIn, write, syncNow]);

  const value = useMemo<BudgetContextValue>(
    () => ({
      status,
      error,
      doc: store.doc,
      syncStatus,
      syncError,
      pending: store.sync === "pending",
      change,
      reload: () => setLoadCount((n) => n + 1),
      syncNow,
      guestBudget: signedIn && serverEmpty && store.doc === null ? guest : null,
      importGuestBudget,
    }),
    [status, error, store, syncStatus, syncError, change, syncNow, signedIn, serverEmpty, guest, importGuestBudget],
  );

  return <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>;
}

export function useBudgetStore(): BudgetContextValue {
  const context = useContext(BudgetContext);
  if (!context) throw new Error("useBudgetStore must be used within <BudgetProvider>");
  return context;
}
