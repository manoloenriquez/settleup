"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteAccount } from "@/app/actions/account";

const CONFIRM_PHRASE = "delete my account";

export function DeleteAccountSection(): React.ReactElement {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const canDelete = confirmText.trim().toLowerCase() === CONFIRM_PHRASE && !isPending;

  function handleDelete(): void {
    if (!canDelete) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteAccount();
      // On success the action redirects, so we only see this branch on failure.
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="mt-3 rounded-xl border border-red-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-600">
          <Trash2 size={18} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-900">Delete account</p>
          <p className="mt-1 text-xs text-slate-500">
            Permanently deletes your account, profile, and payment settings. Groups you own will be
            removed. This cannot be undone.
          </p>

          <div className="mt-4 space-y-2">
            <label htmlFor="confirm-delete" className="block text-xs font-medium text-slate-700">
              Type <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">{CONFIRM_PHRASE}</code> to
              confirm:
            </label>
            <input
              id="confirm-delete"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100"
              placeholder={CONFIRM_PHRASE}
            />
          </div>

          {error && (
            <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? "Deleting…" : "Delete my account"}
          </button>
        </div>
      </div>
    </div>
  );
}
