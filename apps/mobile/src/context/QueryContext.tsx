import { useEffect, useMemo, useRef, useState } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import {
  makeQueryClient,
  persistOptionsForAccount,
  removeLegacyQueryCache,
} from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { purgeInactiveAccountData } from "@/lib/account-data";

// Wait past the persister's 2s write throttle so a detached client cannot
// re-write its snapshot after the purge removed it.
const PURGE_DELAY_MS = 3_000;

/** Every account gets a fresh in-memory client and its own persisted server snapshot. */
export function QueryProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [scope, setScope] = useState(() => ({
    ownerId: null as string | null,
    client: makeQueryClient(),
  }));
  const scopeRef = useRef(scope);
  const persistOptions = useMemo(() => persistOptionsForAccount(scope.ownerId), [scope.ownerId]);
  useEffect(() => {
    void removeLegacyQueryCache().catch(() => undefined);
    let purgeTimer: ReturnType<typeof setTimeout> | null = null;
    const schedulePurge = (ownerId: string | null): void => {
      if (purgeTimer) clearTimeout(purgeTimer);
      purgeTimer = setTimeout(() => {
        void purgeInactiveAccountData(ownerId).catch(() => undefined);
      }, PURGE_DELAY_MS);
    };
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const ownerId = session?.user.id ?? null;
      if (event === "INITIAL_SESSION") schedulePurge(ownerId);
      if (scopeRef.current.ownerId === ownerId) return;
      schedulePurge(ownerId);
      // Cancel old fetches and detach this client. Late responses cannot enter the new account's cache.
      void scopeRef.current.client.cancelQueries();
      const next = { ownerId, client: makeQueryClient() };
      scopeRef.current = next;
      setScope(next);
    });
    return () => {
      if (purgeTimer) clearTimeout(purgeTimer);
      subscription.unsubscribe();
      void scopeRef.current.client.cancelQueries();
    };
  }, []);
  return (
    <PersistQueryClientProvider
      key={scope.ownerId ?? "signed-out"}
      client={scope.client}
      persistOptions={persistOptions}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
