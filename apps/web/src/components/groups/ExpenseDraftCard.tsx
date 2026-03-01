"use client";

import { formatCents } from "@template/shared";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Check, Pencil, X, Sparkles } from "lucide-react";
import type { ExpenseDraft } from "@template/shared/types";

type Props = {
  draft: ExpenseDraft;
  onAccept: () => void;
  onEdit: () => void;
  onDismiss: () => void;
  isLoading?: boolean;
};

export function ExpenseDraftCard({
  draft,
  onAccept,
  onEdit,
  onDismiss,
  isLoading = false,
}: Props): React.ReactElement {
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 flex flex-col gap-3 animate-slide-down">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-indigo-500" />
          <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">
            Draft from {draft.source}
          </span>
          <Badge variant="neutral">
            {Math.round(draft.confidence * 100)}%
          </Badge>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-white"
        >
          <X size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div>
          <span className="text-slate-500">Item:</span>{" "}
          <span className="font-medium text-slate-900">{draft.item_name}</span>
        </div>
        <div>
          <span className="text-slate-500">Amount:</span>{" "}
          <span className="font-medium text-slate-900">{formatCents(draft.amount_cents)}</span>
        </div>
        {draft.payer_name && (
          <div>
            <span className="text-slate-500">Paid by:</span>{" "}
            <span className="font-medium text-slate-900">{draft.payer_name}</span>
          </div>
        )}
        {draft.participant_names.length > 0 && (
          <div className="col-span-2">
            <span className="text-slate-500">Split between:</span>{" "}
            <span className="font-medium text-slate-900">
              {draft.participant_names.join(", ")}
            </span>
          </div>
        )}
        {draft.notes && (
          <div className="col-span-2">
            <span className="text-slate-500">Notes:</span>{" "}
            <span className="text-slate-700">{draft.notes}</span>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={onAccept} isLoading={isLoading} leftIcon={Check}>
          Accept
        </Button>
        <Button size="sm" variant="secondary" onClick={onEdit} leftIcon={Pencil}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss} leftIcon={X}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
