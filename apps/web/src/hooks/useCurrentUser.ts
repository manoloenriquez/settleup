"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

/**
 * The signed-in user's id, read from the local session (no network).
 * Display-only trust — RLS and middleware remain the real gates. Key is in
 * NON_PERSISTED_KEYS so identity never persists across accounts.
 */
export function useCurrentUserId(): string | null {
  const { data } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async (): Promise<string | null> => {
      const { data: auth } = await supabase.auth.getSession();
      return auth.session?.user.id ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
  return data ?? null;
}
