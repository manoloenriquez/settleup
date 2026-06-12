"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addExpense } from "@/app/actions/expenses";
import { parsePHPAmount } from "@template/shared";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { CategorySelect } from "./CategoryControls";
import { Plus } from "lucide-react";
import type { ExpenseCategory, GroupMember } from "@template/supabase";

type Props = {
  groupId: string;
  members: GroupMember[];
  categories: ExpenseCategory[];
  currentUserId: string;
  onClose?: () => void;
};

export function QuickAddExpense({ groupId, members, categories, currentUserId, onClose }: Props): React.ReactElement {
  const [itemName, setItemName] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(categories.find((category) => category.slug === "other")?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const myMemberId = members.find((m) => m.user_id === currentUserId)?.id ?? members[0]?.id ?? "";
  const [payerId, setPayerId] = useState(myMemberId);
  const allMemberIds = members.map((m) => m.id);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setError(null);

    const amountCents = parsePHPAmount(amountStr);
    if (!itemName.trim()) {
      setError("Enter an item name");
      return;
    }
    if (!amountCents || amountCents <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (!payerId) {
      setError("No members in group");
      return;
    }

    startTransition(async () => {
      const result = await addExpense({
        group_id: groupId,
        category_id: categoryId,
        item_name: itemName.trim(),
        amount_cents: amountCents,
        participant_ids: allMemberIds,
        payers: [{ member_id: payerId, paid_cents: amountCents }],
      });
      if (result.error) {
        setError(result.error);
      } else {
        toast.success("Expense added!");
        setItemName("");
        setAmountStr("");
        setCategoryId(categories.find((category) => category.slug === "other")?.id ?? null);
        router.refresh();
        onClose?.();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">
        Split equally among all {members.length} members. Use Detailed mode for multiple payers or custom splits.
      </p>
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="What was it for?"
          />
        </div>
        <div className="w-32">
          <Input
            leftAddon="₱"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <Button type="submit" isLoading={isPending} size="md" leftIcon={Plus}>
          Add
        </Button>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <Select label="Paid by" value={payerId} onChange={(e) => setPayerId(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
                {m.user_id === currentUserId ? " (you)" : ""}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex-1">
          <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
