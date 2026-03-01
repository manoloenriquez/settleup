"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ContentDialog } from "@/components/ui/ContentDialog";
import { QuickAddExpense } from "./QuickAddExpense";
import { ConversationInput } from "./ConversationInput";
import { ReceiptUploader } from "./ReceiptUploader";
import { ReceiptReviewForm } from "./ReceiptReviewForm";
import { ExpenseDraftCard } from "./ExpenseDraftCard";
import { AddExpenseForm } from "./AddExpenseForm";
import { Zap, MessageSquare, Camera, SlidersHorizontal } from "lucide-react";
import type { GroupMember } from "@template/supabase";
import type { ExpenseDraft, ParsedReceipt } from "@template/shared/types";
import { fuzzyMatchMember } from "@template/shared";
import { addExpense } from "@/app/actions/expenses";

type Props = {
  open: boolean;
  onClose: () => void;
  groupId: string;
  members: GroupMember[];
};

type Mode = "quick" | "chat" | "receipt" | "detailed";

const modes: { id: Mode; label: string; icon: typeof Zap }[] = [
  { id: "quick", label: "Quick", icon: Zap },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "receipt", label: "Receipt", icon: Camera },
  { id: "detailed", label: "Detailed", icon: SlidersHorizontal },
];

export function AddExpenseDialog({ open, onClose, groupId, members }: Props): React.ReactElement {
  const [mode, setMode] = useState<Mode>("quick");
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [receipt, setReceipt] = useState<ParsedReceipt | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDraft(d: ExpenseDraft): void {
    setDraft(d);
  }

  function handleReceipt(r: ParsedReceipt): void {
    setReceipt(r);
  }

  function acceptDraft(): void {
    if (!draft) return;

    // Resolve names to IDs
    const participantIds =
      draft.participant_names.length > 0
        ? draft.participant_names
            .map((name) => fuzzyMatchMember(name, members))
            .filter((id): id is string => id !== null)
        : members.map((m) => m.id);

    const payerId = draft.payer_name
      ? fuzzyMatchMember(draft.payer_name, members) ?? members[0]?.id
      : members[0]?.id;

    if (!payerId || participantIds.length === 0) {
      toast.error("Could not resolve members");
      return;
    }

    startTransition(async () => {
      const result = await addExpense({
        group_id: groupId,
        item_name: draft.item_name,
        amount_cents: draft.amount_cents,
        notes: draft.notes ?? undefined,
        participant_ids: participantIds,
        payers: [{ member_id: payerId, paid_cents: draft.amount_cents }],
      });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Expense added!");
        setDraft(null);
        setReceipt(null);
        onClose();
        router.refresh();
      }
    });
  }

  function handleClose(): void {
    setDraft(null);
    setReceipt(null);
    setMode("quick");
    onClose();
  }

  return (
    <ContentDialog open={open} onClose={handleClose} title="Add Expense" size="lg">
      <div className="flex flex-col gap-4">
        {/* Mode tabs */}
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {modes.map((m) => {
            const Icon = m.icon;
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMode(m.id);
                  setDraft(null);
                  setReceipt(null);
                }}
                className={[
                  "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                  active
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700",
                ].join(" ")}
              >
                <Icon size={14} />
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Draft card (shown for any mode) */}
        {draft && (
          <ExpenseDraftCard
            draft={draft}
            onAccept={acceptDraft}
            onEdit={() => {
              setMode("detailed");
              setDraft(null);
            }}
            onDismiss={() => setDraft(null)}
            isLoading={isPending}
          />
        )}

        {/* Mode content */}
        {!draft && (
          <>
            {mode === "quick" && (
              <QuickAddExpense groupId={groupId} members={members} onClose={handleClose} />
            )}
            {mode === "chat" && (
              <ConversationInput groupId={groupId} members={members} onDraft={handleDraft} />
            )}
            {mode === "receipt" && !receipt && (
              <ReceiptUploader onParsed={handleReceipt} />
            )}
            {mode === "receipt" && receipt && (
              <ReceiptReviewForm
                receipt={receipt}
                onCreateDraft={handleDraft}
                onDismiss={() => setReceipt(null)}
              />
            )}
            {mode === "detailed" && (
              <AddExpenseForm groupId={groupId} members={members} />
            )}
          </>
        )}
      </div>
    </ContentDialog>
  );
}
