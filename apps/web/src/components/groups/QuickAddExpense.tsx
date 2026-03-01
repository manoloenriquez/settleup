"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addExpense } from "@/app/actions/expenses";
import { parsePHPAmount } from "@template/shared";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Plus } from "lucide-react";
import type { GroupMember } from "@template/supabase";

type Props = {
  groupId: string;
  members: GroupMember[];
  onClose?: () => void;
};

export function QuickAddExpense({ groupId, members, onClose }: Props): React.ReactElement {
  const [itemName, setItemName] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const firstMemberId = members[0]?.id;
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
    if (!firstMemberId) {
      setError("No members in group");
      return;
    }

    startTransition(async () => {
      const result = await addExpense({
        group_id: groupId,
        item_name: itemName.trim(),
        amount_cents: amountCents,
        participant_ids: allMemberIds,
        payers: [{ member_id: firstMemberId, paid_cents: amountCents }],
      });
      if (result.error) {
        setError(result.error);
      } else {
        toast.success("Expense added!");
        setItemName("");
        setAmountStr("");
        router.refresh();
        onClose?.();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">
        Paid by you, split equally among all {members.length} members
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
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
