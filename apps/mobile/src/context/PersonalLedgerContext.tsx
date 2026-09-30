import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as Crypto from "expo-crypto";
import {
  addPersonalExpense,
  deletePersonalExpense,
  emptyPersonalLedger,
  restorePersonalExpense,
  updatePersonalExpense,
  visiblePersonalExpenses,
  type PersonalExpense,
  type PersonalExpenseInput,
  type PersonalLedgerState,
  type PersonalWriteContext,
} from "@template/shared";
import { useAuth } from "@/context/AuthContext";
import { loadPersonalLedger, personalStoreKey, savePersonalLedger } from "@/lib/personal/storage";

// ---------------------------------------------------------------------------
// The personal ledger for whoever is using the app right now: the guest store
// when signed out, the account's own store when signed in. Every write is
// persisted before the UI state changes, and writes are serialized so two
// quick taps can never overwrite each other.
// ---------------------------------------------------------------------------

type Status = "loading" | "ready" | "error";

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

function OwnerLedgerProvider({
  ownerId,
  children,
}: {
  ownerId: string | null;
  children: React.ReactNode;
}): React.ReactElement {
  const key = personalStoreKey(ownerId);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [ledger, setLedger] = useState<PersonalLedgerState>(emptyPersonalLedger);
  const latest = useRef<PersonalLedgerState | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [loadCount, setLoadCount] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    loadPersonalLedger(key)
      .then((state) => {
        if (!active) return;
        latest.current = state;
        setLedger(state);
        setStatus("ready");
        setError(null);
      })
      .catch((e: unknown) => {
        if (!active) return;
        latest.current = null;
        setError(e instanceof Error ? e.message : "Saved expenses could not be read.");
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [key, loadCount]);

  const write = useCallback(
    <T,>(change: (state: PersonalLedgerState, ctx: PersonalWriteContext) => { state: PersonalLedgerState; result: T }) => {
      const run = queue.current.then(async () => {
        const current = latest.current;
        if (!current) throw new Error("Your expenses are still loading. Try again in a moment.");
        const ctx = { now: new Date().toISOString(), tracksSync: ownerId !== null };
        const { state, result } = change(current, ctx);
        await savePersonalLedger(key, state);
        latest.current = state;
        setLedger(state);
        return result;
      });
      queue.current = run.catch(() => undefined);
      return run;
    },
    [key, ownerId],
  );

  const value = useMemo<PersonalLedgerContextValue>(
    () => ({
      status,
      error,
      ledger,
      expenses: visiblePersonalExpenses(ledger),
      add: (input) =>
        write((state, ctx) => {
          const id = Crypto.randomUUID();
          return { state: addPersonalExpense(state, id, input, ctx), result: id };
        }),
      update: (id, input) =>
        write((state, ctx) => ({ state: updatePersonalExpense(state, id, input, ctx), result: undefined })),
      remove: (id) =>
        write((state, ctx) => ({ state: deletePersonalExpense(state, id, ctx), result: undefined })),
      restore: (id) =>
        write((state, ctx) => ({ state: restorePersonalExpense(state, id, ctx), result: undefined })),
      reload: () => setLoadCount((count) => count + 1),
    }),
    [status, error, ledger, write],
  );

  return <PersonalLedgerContext.Provider value={value}>{children}</PersonalLedgerContext.Provider>;
}

export function usePersonalLedger(): PersonalLedgerContextValue {
  const context = useContext(PersonalLedgerContext);
  if (!context) throw new Error("usePersonalLedger must be used within <PersonalLedgerProvider>");
  return context;
}
