"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Globe, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/groups/CopyButton";
import { Dialog } from "@/components/ui/Dialog";
import { regenerateGroupLink, setGroupLinkEnabled, setHideMyPaymentDetails } from "@/app/actions/collaboration";
import { invalidateGroupData } from "@/lib/query-keys";

type Props = {
  groupId: string;
  shareEnabled: boolean;
  shareToken: string;
  /** Admins and the owner can turn the link off/on or replace it. */
  canManage: boolean;
  /** My own membership, if I'm a current member: the per-group privacy switch. */
  myHidden: boolean | null;
};

type Pending = "off" | "on" | "new" | null;

/**
 * The group's read-only shared page (/g/…): whether it is on, copy it, make a
 * new link or turn it off, and whether my payment details appear on it.
 * Same controls and wording as the iPhone app's Shared Link section.
 */
export function SharedLinkSection({ groupId, shareEnabled, shareToken, canManage, myHidden }: Props): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(shareEnabled);
  const [token, setToken] = useState(shareToken);
  const [confirm, setConfirm] = useState<Pending>(null);
  const [hidden, setHidden] = useState(myHidden ?? false);
  const [error, setError] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/g/${token}`;

  function refresh(): void {
    invalidateGroupData(queryClient, groupId);
    router.refresh();
  }

  function runLinkChange(kind: Exclude<Pending, null>): void {
    setError(null);
    startTransition(async () => {
      const result = kind === "new" ? await regenerateGroupLink(groupId) : await setGroupLinkEnabled(groupId, kind === "on");
      setConfirm(null);
      if (result.error !== null) {
        setError(result.error);
        return;
      }
      setEnabled(result.data.shareEnabled);
      if (result.data.shareToken) setToken(result.data.shareToken);
      toast.success(
        kind === "new"
          ? "New link ready. The old one no longer works."
          : kind === "on"
            ? "Shared link turned on"
            : "Shared link turned off",
      );
      refresh();
    });
  }

  function handleHidden(next: boolean): void {
    setHidden(next);
    setError(null);
    startTransition(async () => {
      const result = await setHideMyPaymentDetails(groupId, next);
      if (result.error !== null) {
        setHidden(!next);
        setError(result.error);
        return;
      }
      toast.success(next ? "Your payment details are hidden in this group" : "Your payment details follow your account setting");
      refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="shared-link-heading">
      <h2 id="shared-link-heading" className="mb-2 flex items-center gap-2 text-base font-semibold text-slate-700">
        <Globe size={16} className="text-slate-400" aria-hidden />
        {enabled ? "Shared link is on" : "Shared link is off"}
      </h2>
      <p className="text-sm text-slate-500">
        {enabled
          ? "Anyone with the link can view this group’s expenses and balances — no account needed. They can’t change anything."
          : "No one can open this group from a link."}
      </p>

      {enabled && (
        <div className="mt-3 flex items-center gap-2">
          <input
            readOnly
            value={url}
            aria-label="Group link"
            className="min-w-0 flex-1 truncate rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600"
          />
          <CopyButton text={url} label="Copy link" />
        </div>
      )}

      {canManage && (
        <div className="mt-3 flex flex-wrap gap-2">
          {enabled && (
            <Button variant="secondary" size="sm" leftIcon={RefreshCw} onClick={() => setConfirm("new")} disabled={isPending}>
              Make a new link
            </Button>
          )}
          <Button
            variant={enabled ? "danger" : "secondary"}
            size="sm"
            onClick={() => setConfirm(enabled ? "off" : "on")}
            disabled={isPending}
          >
            {enabled ? "Turn off link" : "Turn on link"}
          </Button>
        </div>
      )}

      {myHidden !== null && (
        <label className="mt-4 flex items-start gap-3 border-t border-slate-100 pt-4">
          <input
            type="checkbox"
            checked={hidden}
            onChange={(e) => handleHidden(e.target.checked)}
            disabled={isPending}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span>
            <span className="block text-sm font-medium text-slate-700">Hide my payment details in this group</span>
            <span className="block text-sm text-slate-500">
              Your GCash and bank details never appear on this group’s shared pages, even if you show them elsewhere.
            </span>
          </span>
        </label>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === "new" ? "Make a new link?" : confirm === "off" ? "Turn off the shared link?" : "Turn on a shared link?"}
        description={
          confirm === "new"
            ? "The current link stops working right away. Send the new one to anyone who should still see the group."
            : confirm === "off"
              ? "Nobody will be able to open the group summary from the link. You can turn on a new link later."
              : "This creates a new link. Anyone with it can see the group’s expenses, balances and any payment details people chose to show."
        }
        confirmLabel={confirm === "new" ? "Make new link" : confirm === "off" ? "Turn off" : "Turn on"}
        confirmVariant={confirm === "on" ? "primary" : "danger"}
        onConfirm={() => confirm && runLinkChange(confirm)}
        isLoading={isPending}
      />
    </section>
  );
}
