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
import { CategorySelect } from "./CategoryControls";
import { Zap, MessageSquare, Camera, SlidersHorizontal, Sparkles } from "lucide-react";
import type { ExpenseCategory, GroupMember } from "@template/supabase";
import type { ExpenseDraft, ParsedReceipt } from "@template/shared/types";
import { fuzzyMatchMember } from "@template/shared";
import { addExpense } from "@/app/actions/expenses";

type Props = {
  open: boolean;
  onClose: () => void;
  groupId: string;
  members: GroupMember[];
  categories: ExpenseCategory[];
  currentUserId: string;
};

type Mode = "quick" | "chat" | "receipt" | "detailed";

const modes: { id: Mode; label: string; icon: typeof Zap }[] = [
  { id: "quick", label: "Quick", icon: Zap },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "receipt", label: "Receipt", icon: Camera },
  { id: "detailed", label: "Detailed", icon: SlidersHorizontal },
];

export function AddExpenseDialog({ open, onClose, groupId, members, categories, currentUserId }: Props): React.ReactElement {
  const myMemberId = members.find((m) => m.user_id === currentUserId)?.id ?? members[0]?.id;
  const [mode, setMode] = useState<Mode>("quick");
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [receipt, setReceipt] = useState<ParsedReceipt | null>(null);
  const [draftCategoryId, setDraftCategoryId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDraft(d: ExpenseDraft): void {
    setDraft(d);
    const suggested = categories.find((category) => category.is_default && category.slug === d.category_slug);
    setDraftCategoryId(suggested?.id ?? null);
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
      ? fuzzyMatchMember(draft.payer_name, members) ?? myMemberId
      : myMemberId;

    if (!payerId || participantIds.length === 0) {
      toast.error("Could not resolve members");
      return;
    }

    startTransition(async () => {
      const result = await addExpense({
        group_id: groupId,
        item_name: draft.item_name,
        amount_cents: draft.amount_cents,
        category_id: draftCategoryId,
        notes: draft.notes ?? undefined,
        expense_date: draft.date ?? undefined,
        participant_ids: participantIds,
        payers: [{ member_id: payerId, paid_cents: draft.amount_cents }],
      });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Expense added!");
        setDraft(null);
        setDraftCategoryId(null);
        setReceipt(null);
        onClose();
        router.refresh();
      }
    });
  }

  function handleClose(): void {
    setDraft(null);
    setDraftCategoryId(null);
    setReceipt(null);
    setMode("quick");
    onClose();
  }

  return (
    <ContentDialog open={open} onClose={handleClose} title="Add expense" size="lg">
      <div className="flex flex-col gap-4">
        {/* Smart add hint — jumps into the natural-language chat mode */}
        {mode !== "chat" && !draft && (
          <button
            type="button"
            onClick={() => setMode("chat")}
            className="rounded-2xl border border-brand-100 bg-brand-50/70 p-4 text-left transition-colors hover:bg-brand-50"
          >
            <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Sparkles size={15} className="text-brand-600" />
              Smart add
            </span>
            <span className="mt-1 block text-xs text-slate-500">
              Try typing something like:{" "}
              <span className="font-semibold text-brand-700">
                “Dinner 2400 paid by Manolo, split with Aya and Carlo”
              </span>
            </span>
          </button>
        )}

        {/* Mode tabs */}
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {modes.map((m) => {
            const Icon = m.icon;
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
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
          <div className="flex flex-col gap-3">
            <ExpenseDraftCard
              draft={draft}
              onAccept={acceptDraft}
              onEdit={() => {
                setMode("detailed");
                setDraft(null);
                setDraftCategoryId(null);
              }}
              onDismiss={() => {
                setDraft(null);
                setDraftCategoryId(null);
              }}
              isLoading={isPending}
            />
            <CategorySelect categories={categories} value={draftCategoryId} onChange={setDraftCategoryId} />
          </div>
        )}

        {/* Mode content */}
        {!draft && (
          <>
            {mode === "quick" && (
              <QuickAddExpense
                groupId={groupId}
                members={members}
                categories={categories}
                currentUserId={currentUserId}
                onClose={handleClose}
                onMoreOptions={() => setMode("detailed")}
              />
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
              <AddExpenseForm groupId={groupId} members={members} categories={categories} />
            )}
          </>
        )}
      </div>
    </ContentDialog>
  );
}
