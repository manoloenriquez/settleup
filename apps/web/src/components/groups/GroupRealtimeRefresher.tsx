"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@template/supabase/browser";

/**
 * Subscribes to Realtime changes for this group and refreshes the page
 * (debounced) so balances and expenses stay current when other members
 * make changes. Renders nothing.
 */
export function GroupRealtimeRefresher({ groupId }: { groupId: string }): null {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();

    const refresh = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => router.refresh(), 500);
    };

    const channel = supabase
      .channel(`group-${groupId}`)
      .on("postgres_changes", { event: "*", schema: "settleup", table: "expenses", filter: `group_id=eq.${groupId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "settleup", table: "payments", filter: `group_id=eq.${groupId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "settleup", table: "group_members", filter: `group_id=eq.${groupId}` }, refresh)
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [groupId, router]);

  return null;
}
