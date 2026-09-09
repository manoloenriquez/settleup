import { useEffect, useMemo, useRef, useState } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import {
  makeQueryClient,
  persistOptionsForAccount,
  removeLegacyQueryCache,
} from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";

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
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const ownerId = session?.user.id ?? null;
      if (scopeRef.current.ownerId === ownerId) return;
      // Cancel old fetches and detach this client. Late responses cannot enter the new account's cache.
      void scopeRef.current.client.cancelQueries();
      const next = { ownerId, client: makeQueryClient() };
      scopeRef.current = next;
      setScope(next);
    });
    return () => {
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
