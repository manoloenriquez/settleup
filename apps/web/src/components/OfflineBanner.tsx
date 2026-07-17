"use client";

import { CloudOff } from "lucide-react";
import { useOnline } from "@/hooks/useOnline";

/**
 * Global connectivity strip shown while the browser is offline. Previously
 * visited pages keep rendering from the service-worker cache; this makes the
 * staleness explicit instead of letting actions fail with generic errors.
 */
export function OfflineBanner(): React.ReactElement | null {
  const online = useOnline();
  if (online) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-sm font-medium text-amber-900"
    >
      <CloudOff className="h-4 w-4" aria-hidden />
      <span>You&apos;re offline — showing saved data</span>
    </div>
  );
}
