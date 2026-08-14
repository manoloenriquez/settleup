"use client";

import { useTransition, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { updateExpense, updateItemizedExpense } from "@/app/actions/expenses";
import { invalidateGroupData } from "@/lib/query-keys";
import { formatCents, parsePHPAmount, equalSplit, isEqualShareSplit } from "@template/shared";
import type { OutboxJson } from "@template/shared";
import {
  buildUpdateCustomExpenseRpcInput,
  buildUpdateEqualExpenseRpcInput,
  buildUpdateItemizedExpenseRpcInput,
} from "@template/supabase";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { CategorySelect } from "./CategoryControls";
import { MemberChips } from "./MemberChips";
import { useOnline } from "@/hooks/useOnline";
import { useWebOutbox } from "@/components/OutboxProvider";
import type { ExpenseCategory, GroupMember } from "@template/supabase";
import type { ExpenseWithParticipants } from "@/app/actions/expenses";

type Props = {
  expense: ExpenseWithParticipants | null;
  members: GroupMember[];
  categories: ExpenseCategory[];
  onClose: () => void;
};

function scalePositiveAmounts(weights: number[], totalCents: number): number[] | null {
  if (weights.length === 0) return [];
  if (weights.some((weight) => weight <= 0)) return null;
  if (totalCents < weights.length) return null;
  if (weights.length === 1) return [totalCents];

  const allocations = new Array<number>(weights.length).fill(1);
  const remaining = totalCents - weights.length;
  if (remaining === 0) return allocations;

  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const scaled = weights.map((weight, index) => {
    const raw = weight * remaining;
    return {
      index,
      base: Math.floor(raw / weightTotal),
      remainder: raw % weightTotal,
    };
  });

  for (const item of scaled) {
    allocations[item.index] = (allocations[item.index] ?? 0) + item.base;
  }

  let leftover = totalCents - allocations.reduce((sum, amount) => sum + amount, 0);
  const byRemainder = [...scaled].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; i < byRemainder.length && leftover > 0; i += 1) {
    const current = byRemainder[i];
    if (!current) break;
    allocations[current.index] = (allocations[current.index] ?? 0) + 1;
    leftover -= 1;
  }

  return allocations;
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

export function EditExpenseDialog({ expense, members, categories, onClose }: Props): React.ReactElement | null {
  if (!expense) return null;
  return (
    <EditExpenseDialogInner
      key={expense.id}
      expense={expense}
      members={members}
      categories={categories}
      onClose={onClose}
    />
  );
}

type InnerProps = {
  expense: ExpenseWithParticipants;
  members: GroupMember[];
  categories: ExpenseCategory[];
  onClose: () => void;
};

function EditExpenseDialogInner({ expense, members, categories, onClose }: InnerProps): React.ReactElement {
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const online = useOnline();
  const { enqueue } = useWebOutbox();
  const memberMap = new Map(members.map((m) => [m.id, m.display_name]));

  const [name, setName] = useState(expense.item_name);
  const [amount, setAmount] = useState(formatCents(Math.abs(expense.amount_cents)).replace(/[₱,]/g, ""));
  const [date, setDate] = useState(expense.expense_date ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(expense.category_id);
  const [participantIds, setParticipantIds] = useState<string[]>(
    expense.participants.map((participant) => participant.member_id),
  );
  const [itemParticipantIds, setItemParticipantIds] = useState<string[][]>(
    (expense.items ?? []).map((item) => item.item_participants.map((participant) => participant.member_id)),
  );

  const items = expense.items ?? [];
  const isItemized = items.length > 0;
  const wasEqual =
    !isItemized &&
    expense.participants.length > 0 &&
    isEqualShareSplit(expense.participants.map((participant) => participant.share_cents));
  const participantsChanged = !sameIdSet(
    expense.participants.map((participant) => participant.member_id),
    participantIds,
  );
  const amountCents = parsePHPAmount(amount);

  function toggleParticipant(memberId: string): void {
    setParticipantIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
    );
  }

  function toggleItemParticipant(itemIndex: number, memberId: string): void {
    setItemParticipantIds((prev) =>
      prev.map((ids, index) =>
        index === itemIndex
          ? ids.includes(memberId)
            ? ids.filter((id) => id !== memberId)
            : [...ids, memberId]
          : ids,
      ),
    );
  }

  function handleEdit(): void {
    const parsedAmount = parsePHPAmount(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error("Invalid amount");
      return;
    }

    if (!isItemized && participantIds.length === 0) {
      toast.error("Select at least one participant.");
      return;
    }

    if (isItemized) {
      const emptyIndex = itemParticipantIds.findIndex((ids) => ids.length === 0);
      if (emptyIndex >= 0) {
        toast.error(`"${items[emptyIndex]?.name ?? "Line item"}" needs at least one person.`);
        return;
      }
    }

    const payerAmounts = scalePositiveAmounts(
      expense.payers.map((payer) => payer.paid_cents),
      parsedAmount,
    );
    if (!payerAmounts) {
      toast.error("Amount is too small to preserve payer contributions.");
      return;
    }

    const useEqual = wasEqual || participantsChanged;
    const customSplitAmounts = isItemized || useEqual
      ? null
      : scalePositiveAmounts(
          expense.participants.map((participant) => participant.share_cents),
          parsedAmount,
        );
    if (!isItemized && !useEqual && !customSplitAmounts) {
      toast.error("Amount is too small to preserve custom splits.");
      return;
    }

    const itemAmounts = isItemized
      ? scalePositiveAmounts(items.map((item) => item.amount_cents), parsedAmount)
      : null;
    if (isItemized && !itemAmounts) {
      toast.error("Amount is too small to preserve itemized shares.");
      return;
    }

    const payers = expense.payers.map((payer, index) => ({
      memberId: payer.member_id,
      paidCents: payerAmounts[index]!,
    }));
    const common = {
      expenseId: expense.id,
      expectedUpdatedAt: expense.updated_at,
      categoryId,
      itemName: name.trim(),
      amountCents: parsedAmount,
      notes: expense.notes ?? undefined,
      expenseDate: date || undefined,
      payers,
    };
    const rpcInput = isItemized
      ? buildUpdateItemizedExpenseRpcInput({
          ...common,
          lineItems: items.map((item, index) => ({
            name: item.name,
            amountCents: itemAmounts![index]!,
            participantIds: itemParticipantIds[index] ?? [],
          })),
        })
      : useEqual
        ? buildUpdateEqualExpenseRpcInput({ ...common, participantIds })
        : buildUpdateCustomExpenseRpcInput({
            ...common,
            customSplits: expense.participants.map((participant, index) => ({
              memberId: participant.member_id,
              shareCents: customSplitAmounts![index]!,
            })),
          });

    if (!online) {
      // Queue the exact RPC input for replay on reconnect; the entry chains
      // on the expense id, so it coalesces with earlier queued edits and is
      // cancelled by a queued delete.
      void enqueue({
        id: crypto.randomUUID(),
        kind: isItemized ? "expense.update_itemized" : "expense.update",
        entityId: expense.id,
        groupId: expense.group_id,
        payload: JSON.parse(JSON.stringify(rpcInput)) as OutboxJson,
        createdAt: new Date().toISOString(),
        summary: { title: name.trim(), amountCents: parsedAmount },
      });
      toast.info("Saved offline — will sync when you're back online");
      onClose();
      return;
    }

    startTransition(async () => {
      const result = isItemized
        ? await updateItemizedExpense({
            expense_id: expense.id,
            expected_updated_at: expense.updated_at,
            category_id: categoryId,
            item_name: name.trim(),
            amount_cents: parsedAmount,
            notes: expense.notes ?? undefined,
            expense_date: date || undefined,
            payers: expense.payers.map((payer, index) => ({
              member_id: payer.member_id,
              paid_cents: payerAmounts[index]!,
            })),
            line_items: items.map((item, index) => ({
              name: item.name,
              amount_cents: itemAmounts![index]!,
              participant_ids: itemParticipantIds[index] ?? [],
            })),
          })
        : await updateExpense({
            expense_id: expense.id,
            expected_updated_at: expense.updated_at,
            category_id: categoryId,
            item_name: name.trim(),
            amount_cents: parsedAmount,
            notes: expense.notes ?? undefined,
            expense_date: date || undefined,
            split_mode: useEqual ? "equal" : "custom",
            participant_ids: participantIds,
            custom_splits: useEqual
              ? undefined
              : expense.participants.map((participant, index) => ({
                  member_id: participant.member_id,
                  share_cents: customSplitAmounts![index]!,
                })),
            payers: expense.payers.map((payer, index) => ({
              member_id: payer.member_id,
              paid_cents: payerAmounts[index]!,
            })),
          });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Expense updated");
      onClose();
      invalidateGroupData(queryClient, expense.group_id);
    });
  }

  const equalPreview =
    !isItemized && (wasEqual || participantsChanged) && amountCents && amountCents > 0 && participantIds.length > 0
      ? `Split ${participantIds.length} ways: ~${formatCents(equalSplit(amountCents, participantIds.length)[0] ?? 0)} each`
      : null;

  const rollupNames = [...new Set(itemParticipantIds.flat())]
    .map((id) => memberMap.get(id) ?? "Unknown")
    .join(", ");

  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit expense"
      confirmLabel="Save"
      onConfirm={handleEdit}
      isLoading={isPending}
    >
      <div className="flex flex-col gap-4 mt-2">
        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="edit-name">Name</label>
          <Input
            id="edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Expense name"
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="edit-amount">Amount</label>
          <Input
            id="edit-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="edit-date">Date</label>
          <Input
            id="edit-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1"
          />
        </div>
        <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} />

        {!isItemized && (
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Split between</p>
            <MemberChips members={members} selectedIds={participantIds} onToggle={toggleParticipant} />
            {equalPreview && <p className="mt-1.5 text-xs text-slate-500">{equalPreview}</p>}
            {!wasEqual && participantsChanged && (
              <p className="mt-1.5 text-xs text-amber-600">
                Changing who&apos;s included resets this custom split to an equal split.
              </p>
            )}
          </div>
        )}

        {isItemized && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-slate-700">Line items</p>
            {items.map((item, index) => {
              const selected = itemParticipantIds[index] ?? [];
              return (
                <div key={item.id} className="rounded-md border border-slate-200 bg-white p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-slate-700 truncate">{item.name}</span>
                    <span className="text-slate-500 whitespace-nowrap shrink-0">{formatCents(item.amount_cents)}</span>
                  </div>
                  <MemberChips
                    size="sm"
                    members={members}
                    selectedIds={selected}
                    onToggle={(memberId) => toggleItemParticipant(index, memberId)}
                  />
                  {selected.length > 0 ? (
                    <p className="text-xs text-slate-500">
                      {selected.length} {selected.length === 1 ? "person" : "people"} · ~{formatCents(equalSplit(item.amount_cents, selected.length)[0] ?? 0)} each
                    </p>
                  ) : (
                    <p className="text-xs text-red-600">Needs at least one person</p>
                  )}
                </div>
              );
            })}
            <p className="text-xs text-slate-500">Split among: {rollupNames || "nobody"}</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
