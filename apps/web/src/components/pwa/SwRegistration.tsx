"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Manual service-worker registration with a user-controlled update flow.
 *
 * The build sets `register: false` and the worker sets `skipWaiting: false`,
 * so a newly deployed worker sits in the waiting state until the user accepts
 * the toast below — updates never swap cached assets mid-session. Serwist
 * handles the `SKIP_WAITING` message natively; the `controllerchange` event
 * then reloads once, onto the new version.
 */
export function SwRegistration(): null {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // Ask the browser not to evict our storage (outbox + query cache) under
    // pressure — granted automatically for installed PWAs. Best-effort.
    if (navigator.storage?.persist) {
      void navigator.storage.persist().catch(() => undefined);
    }

    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });

    function promptForUpdate(waiting: ServiceWorker): void {
      toast("A new version of SettleUp is available", {
        duration: Infinity,
        action: {
          label: "Refresh",
          onClick: () => waiting.postMessage({ type: "SKIP_WAITING" }),
        },
      });
    }

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        // A worker was already waiting when the page loaded (update deployed
        // while the app was closed).
        if (registration.waiting && navigator.serviceWorker.controller) {
          promptForUpdate(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            // First install has no controller — the new worker activates
            // silently; only a replacement worker needs user consent.
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              promptForUpdate(installing);
            }
          });
        });
      })
      .catch(() => {
        // Registration failures (private mode, unsupported) degrade to a
        // regular online-only page — nothing to surface.
      });
  }, []);

  return null;
}
