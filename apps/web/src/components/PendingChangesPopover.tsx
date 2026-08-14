"use client";

import { useState } from "react";
import { CloudUpload, X } from "lucide-react";
import { formatCents } from "@template/shared";
import type { OutboxEntry } from "@template/shared";
import { useWebOutbox } from "@/components/OutboxProvider";
import { Button } from "@/components/ui/Button";

// Total Record: the compiler forces a label for every outbox kind.
const KIND_LABELS: Record<OutboxEntry["kind"], string> = {
  "expense.create": "Add expense",
  "expense.create_itemized": "Add itemized expense",
  "expense.update": "Edit expense",
  "expense.update_itemized": "Edit itemized expense",
  "expense.delete": "Delete expense",
  "payment.record": "Record payment",
  "comment.create": "Add comment",
};

/**
 * Floating "N pending" chip shown while offline writes are queued; expands to
 * the entry list with per-item status and Retry/Discard for failures. Synced
 * entries leave the queue, so the chip disappears once everything is clean.
 */
export function PendingChangesPopover(): React.ReactElement | null {
  const { entries, retry, discard } = useWebOutbox();
  const [open, setOpen] = useState(false);

  if (entries.length === 0) return null;
  const failedCount = entries.filter((e) => e.status === "failed").length;

  return (
    <div className="fixed bottom-24 right-4 z-40 flex flex-col items-end gap-2 md:bottom-6">
      {open && (
        <div className="w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Pending changes</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close pending changes"
              className="rounded p-1 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            {entries.map((entry) => (
              <li key={entry.id} className="rounded-xl border border-slate-100 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">
                      {KIND_LABELS[entry.kind]}
                    </p>
                    <p className="truncate text-sm font-medium text-slate-900">
                      {entry.summary.title}
                      {entry.summary.amountCents > 0 ? ` · ${formatCents(entry.summary.amountCents)}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      entry.status === "failed"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {entry.status === "failed" ? "Failed" : "Pending"}
                  </span>
                </div>
                {entry.status === "failed" && (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-xs text-red-600">
                      {entry.lastError?.class === "conflict"
                        ? "Changed by someone else."
                        : entry.lastError?.class === "not_found"
                          ? "Deleted by someone else."
                          : (entry.lastError?.message ?? "Sync failed.")}
                    </p>
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="secondary" onClick={() => void retry(entry.id)}>
                        Retry
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void discard(entry.id)}>
                        Discard
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-md transition-colors ${
          failedCount > 0
            ? "bg-red-600 text-white hover:bg-red-700"
            : "bg-amber-500 text-white hover:bg-amber-600"
        }`}
      >
        <CloudUpload className="h-4 w-4" aria-hidden />
        {entries.length} pending
      </button>
    </div>
  );
}
