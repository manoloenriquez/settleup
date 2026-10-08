"use client";

import { useState, useTransition, type Dispatch, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateGroupData } from "@/lib/query-keys";
import { toast } from "sonner";
import { addExpense } from "@/app/actions/expenses";
import { amountToInput, currencySymbol, equalSplit, parseAmountInput, type CurrencyCode } from "@template/shared";
import { formatCurrency, MONEY_LOCALE } from "@/lib/currency";
import { errorClassFor, participantBucket } from "@template/shared/analytics";
import { track } from "@/lib/analytics/client";
import { buildEqualExpenseRpcInput } from "@template/supabase";
import type { OutboxJson } from "@template/shared";
import { useWebOutbox } from "@/components/OutboxProvider";
import { useOnline } from "@/hooks/useOnline";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { CategorySelect } from "./CategoryControls";
import { makeEmptyItem, type ItemState } from "./AddExpenseForm";
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import type { ExpenseCategory, GroupMember } from "@template/supabase";

/** Local YYYY-MM-DD (never UTC — toISOString is a day off after 8am PH). */
function localTodayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

type Props = {
  groupId: string;
  members: GroupMember[];
  categories: ExpenseCategory[];
  currentUserId: string;
  item: ItemState;
  /** Currency the expense is saved in (chosen in the dialog). */
  currency: CurrencyCode;
  setItem: (update: (item: ItemState) => ItemState) => void;
  expenseDate: string;
  setExpenseDate: Dispatch<SetStateAction<string>>;
  onClose?: () => void;
  onMoreOptions?: () => void;
};

export function QuickAddExpense({
  groupId,
  members,
  categories,
  currentUserId,
  item,
  currency,
  setItem,
  expenseDate,
  setExpenseDate,
  onClose,
  onMoreOptions,
}: Props): React.ReactElement {
  const { itemName, amountStr, categoryId, selectedIds } = item;
  const payerId = item.payers[0]?.memberId ?? "";
  const setItemName = (value: string): void =>
    setItem((previous) => ({ ...previous, itemName: value }));
  const setAmountStr = (value: string): void =>
    setItem((previous) => ({ ...previous, amountStr: value }));
  const setCategoryId = (value: string | null): void =>
    setItem((previous) => ({ ...previous, categoryId: value }));
  const setPayerId = (value: string): void =>
    setItem((previous) => ({
      ...previous,
      payers: [{ memberId: value, amountStr: previous.amountStr }],
    }));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const online = useOnline();
  const { enqueue } = useWebOutbox();

  const myMemberId = members.find((m) => m.user_id === currentUserId)?.id ?? members[0]?.id ?? "";
  const payer = members.find((m) => m.id === payerId);

  // Live per-member preview of the equal split, in member-list order.
  const amountCents = parseAmountInput(amountStr, currency) ?? 0;
  const shares = new Map<string, number>();
  if (amountCents > 0 && selectedIds.length > 0) {
    const parts = equalSplit(amountCents, selectedIds.length);
    const ordered = [...selectedIds].sort();
    ordered.forEach((id, i) => shares.set(id, parts[i] ?? 0));
  }

  function toggleMember(id: string): void {
    setItem((previous) => ({
      ...previous,
      selectedIds: previous.selectedIds.includes(id)
        ? previous.selectedIds.filter((x) => x !== id)
        : [...previous.selectedIds, id],
    }));
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);

    const cents = parseAmountInput(amountStr, currency);
    if (!cents || cents <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (!itemName.trim()) {
      setError("Enter a description");
      return;
    }
    if (
      !members.some((member) => member.id === payerId) ||
      selectedIds.some((id) => !members.some((member) => member.id === id))
    ) {
      setError("The group membership changed. Review the payer and participants.");
      return;
    }
    if (selectedIds.length === 0) {
      setError("Select at least one person to split between");
      return;
    }

    // Client-generated UUID = the create_expense idempotency key, shared by
    // the online action and the offline outbox replay.
    const clientId = item.id;

    const resetForm = (): void => {
      setItem(() =>
        makeEmptyItem(
          members.map((member) => member.id),
          myMemberId,
          categories.find((category) => category.slug === "other")?.id ?? null,
        ),
      );
      setExpenseDate(localTodayISO());
    };

    if (!online) {
      // Queue the exact RPC input for replay on reconnect; rows appear after
      // the drain's router.refresh(). Feedback comes from the pending chip.
      const payload = buildEqualExpenseRpcInput({
        clientId,
        groupId,
        categoryId,
        itemName: itemName.trim(),
        notes: item.notes || undefined,
        amountCents: cents,
        currencyCode: currency,
        expenseDate: expenseDate || undefined,
        participantIds: selectedIds,
        payers: [{ memberId: payerId, paidCents: cents }],
      });
      try {
        await enqueue({
          id: clientId,
          kind: "expense.create",
          entityId: clientId,
          groupId,
          payload: JSON.parse(JSON.stringify(payload)) as OutboxJson,
          createdAt: new Date().toISOString(),
          summary: { title: itemName.trim(), amountCents: cents },
        });
      } catch {
        toast.error(
          "Could not save on this device. Your changes are still here; please try again.",
        );
        return;
      }
      toast.info("Saved offline — will sync when you're back online");
      track({
        name: "expense_saved",
        properties: { entry_mode: "quick", participant_bucket: participantBucket(selectedIds.length) },
      });
      resetForm();
      onClose?.();
      return;
    }

    startTransition(async () => {
      const result = await addExpense({
        id: clientId,
        group_id: groupId,
        category_id: categoryId,
        item_name: itemName.trim(),
        notes: item.notes || undefined,
        amount_cents: cents,
        currency_code: currency,
        expense_date: expenseDate || undefined,
        participant_ids: selectedIds,
        payers: [{ member_id: payerId, paid_cents: cents }],
      });
      if (result.error) {
        setError(result.error);
        track({ name: "expense_save_failed", properties: { error_class: errorClassFor(result.error) } });
      } else {
        toast.success("Expense added!");
        track({
          name: "expense_saved",
          properties: { entry_mode: "quick", participant_bucket: participantBucket(selectedIds.length) },
        });
        resetForm();
        invalidateGroupData(queryClient, groupId);
        onClose?.();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Amount — the primary field, per the mockup */}
      <div>
        <label htmlFor="quick-amount" className="text-sm font-medium text-slate-700">
          Amount
        </label>
        <div className="relative mt-1.5">
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-lg font-semibold text-slate-400">
            {currencySymbol(currency, MONEY_LOCALE)}
          </span>
          <input
            id="quick-amount"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            placeholder={amountToInput(0, currency)}
            inputMode="decimal"
            autoComplete="off"
            className={`w-full rounded-2xl border border-slate-300 bg-white py-3.5 ${currencySymbol(currency, MONEY_LOCALE).length > 1 ? "pl-14" : "pl-9"} pr-16 text-xl font-bold tabular-nums text-slate-900 placeholder:font-normal placeholder:text-slate-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100`}
          />
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-semibold text-slate-400">
            {currency}
          </span>
        </div>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="quick-description" className="text-sm font-medium text-slate-700">
          Description
        </label>
        <Input
          id="quick-description"
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          placeholder="Dinner at La Lucci"
          className="mt-1.5 rounded-xl py-2.5"
        />
      </div>

      {/* Date */}
      <div>
        <label htmlFor="quick-date" className="text-sm font-medium text-slate-700">
          Date
        </label>
        <Input
          id="quick-date"
          type="date"
          value={expenseDate}
          onChange={(e) => setExpenseDate(e.target.value)}
          className="mt-1.5 rounded-xl py-2.5"
        />
      </div>

      {/* Paid by */}
      <div>
        <span className="text-sm font-medium text-slate-700">Paid by</span>
        <div className="relative mt-1.5">
          {payer && (
            <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center">
              <Avatar name={payer.display_name} size="xs" />
            </span>
          )}
          <Select
            aria-label="Paid by"
            value={payerId}
            onChange={(e) => setPayerId(e.target.value)}
            className="rounded-xl py-2.5 pl-9"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
                {m.user_id === currentUserId ? " (you)" : ""}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Split between */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Split between</span>
          <button
            type="button"
            onClick={onMoreOptions}
            className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            Equal split <ChevronDown size={13} />
          </button>
        </div>
        <div className="mt-2 flex flex-col divide-y divide-slate-100 rounded-2xl border border-slate-200">
          {members.map((member) => {
            const selected = selectedIds.includes(member.id);
            return (
              <label
                key={member.id}
                className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5"
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleMember(member.id)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                    selected
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-slate-300 bg-white text-transparent"
                  }`}
                >
                  <Check size={13} strokeWidth={3} />
                </span>
                <Avatar name={member.display_name} size="sm" />
                <span
                  className={`flex-1 truncate text-sm font-medium ${selected ? "text-slate-900" : "text-slate-400"}`}
                >
                  {member.display_name}
                  {member.user_id === currentUserId ? " (you)" : ""}
                </span>
                <span
                  className={`shrink-0 text-sm font-semibold tabular-nums ${selected ? "text-slate-900" : "text-slate-300"}`}
                >
                  {formatCurrency(selected ? (shares.get(member.id) ?? 0) : 0, currency)}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Footer actions */}
      <div className="flex gap-3">
        {onMoreOptions && (
          <Button
            type="button"
            variant="secondary"
            onClick={onMoreOptions}
            leftIcon={SlidersHorizontal}
          >
            More options
          </Button>
        )}
        <Button type="submit" isLoading={isPending} className="flex-1">
          Save expense
        </Button>
      </div>
    </form>
  );
}
