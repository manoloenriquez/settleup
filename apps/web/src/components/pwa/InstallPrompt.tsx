"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { APP_NAME } from "@template/shared";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "pwa-install-dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/**
 * Dismissible "install app" prompt.
 * - Android/Chrome/desktop: uses the native `beforeinstallprompt` event.
 * - iOS Safari: shows an "Add to Home Screen" hint (no programmatic install API).
 * Hidden once installed (standalone) or after the user dismisses it.
 */
export function InstallPrompt(): React.ReactElement | null {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    function onBeforeInstall(e: Event): void {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS never fires beforeinstallprompt — show the manual hint instead.
    if (isIos()) {
      setIosHint(true);
      setShow(true);
    }

    function onInstalled(): void {
      setShow(false);
      localStorage.setItem(DISMISS_KEY, "1");
    }
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss(): void {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, "1");
  }

  async function install(): Promise<void> {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    dismiss();
  }

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:bottom-4 md:left-auto md:right-4 md:px-0">
      <div className="mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl md:max-w-sm">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600">
          <span className="text-base font-bold text-white">S</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Install {APP_NAME}</p>
          {iosHint ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
              Tap <Share size={13} className="inline" /> then “Add to Home Screen”.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-slate-500">
              Add it to your home screen for a faster, app-like experience.
            </p>
          )}
          {!iosHint && (
            <button
              type="button"
              onClick={install}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-700"
            >
              <Download size={14} />
              Install
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
