import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Subscribe to Realtime changes for a group's expenses, payments, and
 * members, invalidating the relevant queries (debounced) so the screen
 * reflects edits made by other members without a manual refresh.
 * Realtime respects RLS — events only arrive for groups the user can read.
 */
export function useGroupRealtime(groupId: string | undefined): void {
  const qc = useQueryClient();

  useEffect(() => {
    if (!groupId) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const invalidate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ["balances", groupId] });
        void qc.invalidateQueries({ queryKey: ["expenses", groupId] });
        void qc.invalidateQueries({ queryKey: ["activity", groupId] });
        void qc.invalidateQueries({ queryKey: ["members", groupId] });
        void qc.invalidateQueries({ queryKey: ["pending-payments", groupId] });
        void qc.invalidateQueries({ queryKey: ["dashboard"] });
        void qc.invalidateQueries({ queryKey: ["groups"] });
      }, 400);
    };

    const channel = supabase
      .channel(`group-${groupId}`)
      .on("postgres_changes", { event: "*", schema: "settleup", table: "expenses", filter: `group_id=eq.${groupId}` }, invalidate)
      .on("postgres_changes", { event: "*", schema: "settleup", table: "payments", filter: `group_id=eq.${groupId}` }, invalidate)
      .on("postgres_changes", { event: "*", schema: "settleup", table: "group_members", filter: `group_id=eq.${groupId}` }, invalidate)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [groupId, qc]);
}
