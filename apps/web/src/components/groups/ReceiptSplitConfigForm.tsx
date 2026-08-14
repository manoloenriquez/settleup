"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addExpense, addItemizedExpense } from "@/app/actions/expenses";
import { formatCents, equalSplit } from "@template/shared";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { CategorySelect } from "./CategoryControls";
import { MemberChips } from "./MemberChips";
import { ArrowLeft, Check } from "lucide-react";
import type { ExpenseCategory, GroupMember } from "@template/supabase";
import type { ReceiptReview } from "./ReceiptReviewForm";

type Props = {
  review: ReceiptReview;
  groupId: string;
  members: GroupMember[];
  categories: ExpenseCategory[];
  currentUserId: string;
  onBack: () => void;
  onSaved: () => void;
};

export function ReceiptSplitConfigForm({ review, groupId, members, categories, currentUserId, onBack, onSaved }: Props): React.ReactElement {
  const myMemberId = members.find((m) => m.user_id === currentUserId)?.id ?? members[0]?.id ?? "";
  const [selectedIds, setSelectedIds] = useState<string[]>(members.map((m) => m.id));
  const [payerId, setPayerId] = useState(myMemberId);
  const [splitMode, setSplitMode] = useState<"equal" | "byItem">(review.items.length > 1 ? "byItem" : "equal");
  const [itemAssignments, setItemAssignments] = useState<string[][]>(
    review.items.map(() => members.map((m) => m.id)),
  );
  const [categoryId, setCategoryId] = useState<string | null>(
    categories.find((category) => category.is_default && category.slug === "other")?.id ?? null,
  );
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const itemsSubtotal = review.items.reduce((sum, item) => sum + item.amountCents, 0);
  const canSplitByItem = review.items.length > 1;
  const subtotalMismatch = splitMode === "byItem" && itemsSubtotal !== review.totalCents;

  function toggleSelected(memberId: string): void {
    setSelectedIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
    );
  }

  function toggleItemAssignment(itemIndex: number, memberId: string): void {
    setItemAssignments((prev) =>
      prev.map((ids, index) =>
        index === itemIndex
          ? ids.includes(memberId)
            ? ids.filter((id) => id !== memberId)
            : [...ids, memberId]
          : ids,
      ),
    );
  }

  function handleSave(): void {
    if (!payerId) {
      toast.error("Select who paid.");
      return;
    }

    if (splitMode === "byItem") {
      const emptyIndex = itemAssignments.findIndex((ids) => ids.length === 0);
      if (emptyIndex >= 0) {
        toast.error(`"${review.items[emptyIndex]?.name ?? "Line item"}" needs at least one person.`);
        return;
      }

      startTransition(async () => {
        const result = await addItemizedExpense({
          group_id: groupId,
          item_name: review.itemName,
          amount_cents: itemsSubtotal,
          category_id: categoryId,
          expense_date: review.date ?? undefined,
          payers: [{ member_id: payerId, paid_cents: itemsSubtotal }],
          line_items: review.items.map((item, index) => ({
            name: item.name,
            amount_cents: item.amountCents,
            participant_ids: itemAssignments[index] ?? [],
          })),
        });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Expense added!");
        router.refresh();
        onSaved();
      });
      return;
    }

    if (selectedIds.length === 0) {
      toast.error("Select at least one member.");
      return;
    }

    startTransition(async () => {
      const result = await addExpense({
        group_id: groupId,
        item_name: review.itemName,
        amount_cents: review.totalCents,
        category_id: categoryId,
        notes: review.items.map((item) => `${item.name}: ₱${(item.amountCents / 100).toFixed(2)}`).join("; ") || undefined,
        expense_date: review.date ?? undefined,
        participant_ids: selectedIds,
        payers: [{ member_id: payerId, paid_cents: review.totalCents }],
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Expense added!");
      router.refresh();
      onSaved();
    });
  }

  const equalPreview =
    selectedIds.length > 0
      ? `Split ${selectedIds.length} ways: ~${formatCents(equalSplit(review.totalCents, selectedIds.length)[0] ?? 0)} each`
      : null;

  return (
    <div className="flex flex-col gap-4 animate-slide-down">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          aria-label="Back to receipt review"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-slate-700 truncate">{review.itemName}</h4>
          <p className="text-xs text-slate-400">{formatCents(splitMode === "byItem" ? itemsSubtotal : review.totalCents)}</p>
        </div>
      </div>

      <Select label="Paid by" value={payerId} onChange={(e) => setPayerId(e.target.value)}>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.display_name}
          </option>
        ))}
      </Select>

      {canSplitByItem && (
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {([
            { id: "equal", label: "Split equally" },
            { id: "byItem", label: "Split by item" },
          ] as const).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSplitMode(option.id)}
              className={[
                "flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                splitMode === option.id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              ].join(" ")}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {splitMode === "equal" && (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Split with</p>
          <MemberChips members={members} selectedIds={selectedIds} onToggle={toggleSelected} />
          {equalPreview && <p className="mt-1.5 text-xs text-slate-500">{equalPreview}</p>}
        </div>
      )}

      {splitMode === "byItem" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-slate-700">Who had what?</p>
          {review.items.map((item, index) => {
            const assigned = itemAssignments[index] ?? [];
            return (
              <div key={index} className="rounded-md border border-slate-200 bg-white p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-700 truncate">{item.name}</span>
                  <span className="text-slate-500 whitespace-nowrap shrink-0">{formatCents(item.amountCents)}</span>
                </div>
                <MemberChips
                  size="sm"
                  members={members}
                  selectedIds={assigned}
                  onToggle={(memberId) => toggleItemAssignment(index, memberId)}
                />
                {assigned.length > 0 ? (
                  <p className="text-xs text-slate-500">
                    {assigned.length} {assigned.length === 1 ? "person" : "people"} · ~{formatCents(equalSplit(item.amountCents, assigned.length)[0] ?? 0)} each
                  </p>
                ) : (
                  <p className="text-xs text-red-600">Needs at least one person</p>
                )}
              </div>
            );
          })}
          {subtotalMismatch && (
            <p className="text-xs text-amber-600">
              Saving {formatCents(itemsSubtotal)} — the sum of line items (receipt total was {formatCents(review.totalCents)}).
              Add an item for tax or service charge, or use &quot;Split equally&quot; to keep {formatCents(review.totalCents)}.
            </p>
          )}
        </div>
      )}

      <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} />

      <Button onClick={handleSave} isLoading={isPending} leftIcon={Check} size="sm">
        Save expense
      </Button>
    </div>
  );
}
