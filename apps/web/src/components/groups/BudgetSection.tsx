"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setGroupBudget } from "@/app/actions/groups";
import { parsePHPAmount, formatCents } from "@template/shared";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PiggyBank } from "lucide-react";

type Props = {
  groupId: string;
  budgetCents: number | null;
  canEdit: boolean;
};

export function BudgetSection({ groupId, budgetCents, canEdit }: Props): React.ReactElement {
  const [amountStr, setAmountStr] = useState(budgetCents ? (budgetCents / 100).toFixed(2) : "");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function save(nextCents: number | null): void {
    startTransition(async () => {
      const result = await setGroupBudget(groupId, nextCents);
      if (result.error) toast.error(result.error);
      else {
        toast.success(nextCents ? `Budget set to ${formatCents(nextCents)}` : "Budget removed");
        router.refresh();
      }
    });
  }

  function handleSave(): void {
    const cents = parsePHPAmount(amountStr);
    if (!cents || cents <= 0) {
      toast.error("Enter a valid budget amount.");
      return;
    }
    save(cents);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900 mb-1 flex items-center gap-2">
        <PiggyBank size={16} className="text-brand-500" />
        Group Budget
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        Optional spending cap shown as a progress bar on the group page.
      </p>
      {canEdit ? (
        <div className="flex items-end gap-2 max-w-sm">
          <Input
            label="Budget"
            leftAddon="₱"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. 30000"
          />
          <Button onClick={handleSave} isLoading={isPending}>
            Save
          </Button>
          {budgetCents !== null && (
            <Button variant="ghost" disabled={isPending} onClick={() => save(null)}>
              Remove
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          {budgetCents ? `Budget: ${formatCents(budgetCents)}` : "No budget set."}
        </p>
      )}
    </section>
  );
}
