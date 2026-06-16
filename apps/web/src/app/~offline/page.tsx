import type { Metadata } from "next";
import { APP_NAME } from "@template/shared";
import { RetryButton } from "./RetryButton";

// Fully static so the service worker can precache it and serve it with zero network.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Offline",
};

export default function OfflinePage(): React.ReactElement {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-brand-600 flex items-center justify-center shadow-sm mb-6">
        <span className="text-white text-2xl font-bold">S</span>
      </div>
      <h1 className="text-xl font-bold text-slate-900">You&apos;re offline</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        {APP_NAME} can&apos;t reach the network right now. Pages you&apos;ve already opened are still
        available — we&apos;ll reconnect automatically when you&apos;re back online.
      </p>
      <RetryButton />
    </main>
  );
}
