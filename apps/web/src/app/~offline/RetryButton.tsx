"use client";

import { useEffect } from "react";

export function RetryButton(): React.ReactElement {
  // Reload automatically the moment connectivity returns — the fallback page
  // exists only because the network was down. (This replaces the previous
  // global reloadOnOnline, which reloaded every page on reconnect.)
  useEffect(() => {
    const reload = (): void => window.location.reload();
    window.addEventListener("online", reload);
    return () => window.removeEventListener("online", reload);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="mt-6 inline-flex items-center rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
    >
      Try again
    </button>
  );
}
