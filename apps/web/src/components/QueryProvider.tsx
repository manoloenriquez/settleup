"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import {
  makeQueryClient,
  persistOptionsForAccount,
  removeLegacyQueryCache,
} from "@/lib/query-client";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

/** Every account gets a fresh in-memory client and its own persisted server snapshot. */
export function QueryProvider({
  children,
  ownerId: serverOwnerId,
}: {
  children: React.ReactNode;
  ownerId: string;
}): React.ReactElement {
  const router = useRouter();
  const [scope, setScope] = useState(() => ({
    ownerId: serverOwnerId as string | null,
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
      if (ownerId) router.refresh();
      else router.replace("/login");
    });
    return () => {
      subscription.unsubscribe();
      void scopeRef.current.client.cancelQueries();
    };
  }, [router]);
  if (scope.ownerId !== serverOwnerId)
    return (
      <p role="status" className="p-6 text-sm text-slate-600">
        Updating your account…
      </p>
    );
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
