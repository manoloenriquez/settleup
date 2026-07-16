"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { useOnline } from "@/hooks/useOnline";

/**
 * Short-circuits Server Action calls while offline with a clear message,
 * instead of letting the underlying fetch reject with a generic error. Form
 * state is preserved because the action never runs (nothing resets).
 *
 * Usage:
 *   const guardOnline = useOfflineGuard();
 *   function handleSubmit() {
 *     if (!guardOnline()) return;
 *     startTransition(async () => { ... });
 *   }
 */
export function useOfflineGuard(message = "You're offline — this action needs a connection."): () => boolean {
  const online = useOnline();
  return useCallback(() => {
    if (!online) {
      toast.error(message);
      return false;
    }
    return true;
  }, [online, message]);
}
