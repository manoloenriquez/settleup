"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "@template/supabase/browser";
import { invalidateGroupData, wasRecentlyInvalidatedLocally } from "@/lib/query-keys";

/**
 * Subscribes to Realtime changes for this group and invalidates the group's
 * queries (debounced) so balances and expenses stay current when other
 * members make changes. Also invalidates on channel (re)subscribe so a
 * reconnect after being offline catches anything missed. Renders nothing.
 */
export function GroupRealtimeRefresher({ groupId }: { groupId: string }): null {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscribedOnceRef = useRef(false);

  useEffect(() => {
    const supabase = createBrowserClient();

    const refresh = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        // Skip the echo of this tab's own write — the mutation already
        // invalidated; only remote changes need a refetch.
        if (wasRecentlyInvalidatedLocally(groupId)) return;
        invalidateGroupData(queryClient, groupId);
      }, 500);
    };

    const channel = supabase
      .channel(`group-${groupId}`)
      .on("postgres_changes", { event: "*", schema: "settleup", table: "expenses", filter: `group_id=eq.${groupId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "settleup", table: "payments", filter: `group_id=eq.${groupId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "settleup", table: "group_members", filter: `group_id=eq.${groupId}` }, refresh)
      .subscribe((status) => {
        // A re-subscribe after a dropped connection may have missed events.
        if (status === "SUBSCRIBED") {
          if (subscribedOnceRef.current) refresh();
          subscribedOnceRef.current = true;
        }
      });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [groupId, queryClient]);

  return null;
}
