"use client";

import { useEffect, useState } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { makeQueryClient, persistOptions, clearPersistedQueryCache } from "@/lib/query-client";
import { supabase } from "@/lib/supabase/client";

/**
 * React Query with an IndexedDB-persisted cache: core views render instantly
 * from the last snapshot (including cold offline launches) and revalidate in
 * the background. The cache holds pure server data only — pending offline
 * writes are rendered as overlays derived from the outbox.
 */
export function QueryProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [queryClient] = useState(makeQueryClient);

  // Sign-out drops both the in-memory cache and the persisted snapshot so no
  // data bleeds across accounts.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        queryClient.clear();
        void clearPersistedQueryCache();
      }
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      {children}
    </PersistQueryClientProvider>
  );
}
