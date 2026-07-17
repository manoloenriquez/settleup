"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addExpense } from "@/app/actions/expenses";
import { parsePHPAmount, equalSplit, formatCents } from "@template/shared";
import { buildEqualExpenseRpcInput } from "@template/supabase";
import type { OutboxJson } from "@template/shared";
import { useWebOutbox } from "@/components/OutboxProvider";
import { useOnline } from "@/hooks/useOnline";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { CategorySelect } from "./CategoryControls";
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
  onClose?: () => void;
  onMoreOptions?: () => void;
};

export function QuickAddExpense({
  groupId,
  members,
  categories,
  currentUserId,
  onClose,
  onMoreOptions,
}: Props): React.ReactElement {
  const [itemName, setItemName] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(categories.find((category) => category.slug === "other")?.id ?? null);
  const [expenseDate, setExpenseDate] = useState<string>(localTodayISO());
  const [selectedIds, setSelectedIds] = useState<string[]>(members.map((m) => m.id));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const online = useOnline();
  const { enqueue } = useWebOutbox();

  const myMemberId = members.find((m) => m.user_id === currentUserId)?.id ?? members[0]?.id ?? "";
  const [payerId, setPayerId] = useState(myMemberId);
  const payer = members.find((m) => m.id === payerId);

  // Live per-member preview of the equal split, in member-list order.
  const amountCents = parsePHPAmount(amountStr) ?? 0;
  const shares = new Map<string, number>();
  if (amountCents > 0 && selectedIds.length > 0) {
    const parts = equalSplit(amountCents, selectedIds.length);
    const ordered = members.filter((m) => selectedIds.includes(m.id));
    ordered.forEach((m, i) => shares.set(m.id, parts[i] ?? 0));
  }

  function toggleMember(id: string): void {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setError(null);

    const cents = parsePHPAmount(amountStr);
    if (!cents || cents <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (!itemName.trim()) {
      setError("Enter a description");
      return;
    }
    if (!payerId) {
      setError("No members in group");
      return;
    }
    if (selectedIds.length === 0) {
      setError("Select at least one person to split between");
      return;
    }

    // Client-generated UUID = the create_expense idempotency key, shared by
    // the online action and the offline outbox replay.
    const clientId = crypto.randomUUID();

    const resetForm = (): void => {
      setItemName("");
      setAmountStr("");
      setExpenseDate(localTodayISO());
      setSelectedIds(members.map((m) => m.id));
      setCategoryId(categories.find((category) => category.slug === "other")?.id ?? null);
    };

    if (!online) {
      // Queue the exact RPC input for replay on reconnect; rows appear after
      // the drain's router.refresh(). Feedback comes from the pending chip.
      const payload = buildEqualExpenseRpcInput({
        clientId,
        groupId,
        categoryId,
        itemName: itemName.trim(),
        amountCents: cents,
        expenseDate: expenseDate || undefined,
        participantIds: selectedIds,
        payers: [{ memberId: payerId, paidCents: cents }],
      });
      void enqueue({
        id: clientId,
        kind: "expense.create",
        entityId: clientId,
        groupId,
        payload: JSON.parse(JSON.stringify(payload)) as OutboxJson,
        createdAt: new Date().toISOString(),
        summary: { title: itemName.trim(), amountCents: cents },
      });
      toast.info("Saved offline — will sync when you're back online");
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
        amount_cents: cents,
        expense_date: expenseDate || undefined,
        participant_ids: selectedIds,
        payers: [{ member_id: payerId, paid_cents: cents }],
      });
      if (result.error) {
        setError(result.error);
      } else {
        toast.success("Expense added!");
        resetForm();
        router.refresh();
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
            ₱
          </span>
          <input
            id="quick-amount"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            autoComplete="off"
            className="w-full rounded-2xl border border-slate-300 bg-white py-3.5 pl-9 pr-16 text-xl font-bold tabular-nums text-slate-900 placeholder:font-normal placeholder:text-slate-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-semibold text-slate-400">
            PHP
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
                <span className={`flex-1 truncate text-sm font-medium ${selected ? "text-slate-900" : "text-slate-400"}`}>
                  {member.display_name}
                  {member.user_id === currentUserId ? " (you)" : ""}
                </span>
                <span className={`shrink-0 text-sm font-semibold tabular-nums ${selected ? "text-slate-900" : "text-slate-300"}`}>
                  {formatCents(selected ? shares.get(member.id) ?? 0 : 0)}
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
          <Button type="button" variant="secondary" onClick={onMoreOptions} leftIcon={SlidersHorizontal}>
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
