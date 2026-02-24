"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteExpense } from "@/app/actions/expenses";
import { formatCents } from "@template/shared";
import { Button } from "@/components/ui/Button";
import type { GroupMember } from "@template/supabase";
import type { ExpenseWithParticipants } from "@/app/actions/expenses";

type Props = {
  expenses: ExpenseWithParticipants[];
  members: GroupMember[];
};

export function ExpenseList({ expenses, members }: Props): React.ReactElement {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const memberMap = new Map(members.map((m) => [m.id, m.display_name]));

  function handleDelete(expenseId: string) {
    startTransition(async () => {
      await deleteExpense(expenseId);
      router.refresh();
    });
  }

  if (expenses.length === 0) {
    return <p className="text-sm text-slate-400">No expenses yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {expenses.map((expense) => (
        <div
          key={expense.id}
          className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4"
        >
          <div className="flex-1 min-w-0">
            <p className="font-medium text-slate-900">
              {expense.item_name}
              {expense.amount_cents < 0 && (
                <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  Credit
                </span>
              )}
            </p>
            <p className="text-sm font-semibold text-slate-600">
              {formatCents(expense.amount_cents)}
            </p>
            {expense.payers && expense.payers.length > 0 && (
              <p className="mt-1 text-xs text-indigo-500">
                Paid by{" "}
                {expense.payers
                  .map((p) => {
                    const name = memberMap.get(p.member_id) ?? p.member_id;
                    return expense.payers.length > 1
                      ? `${name} (${formatCents(p.paid_cents)})`
                      : name;
                  })
                  .join(", ")}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-400">
              {expense.participants.map((p) => {
                const name = memberMap.get(p.member_id) ?? p.member_id;
                return `${name} (${formatCents(p.share_cents)})`;
              }).join(", ")}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {new Date(expense.created_at).toLocaleDateString("en-PH")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            isLoading={isPending}
            onClick={() => handleDelete(expense.id)}
            className="text-red-500 hover:text-red-700 hover:bg-red-50"
          >
            Delete
          </Button>
        </div>
      ))}
    </div>
  );
}
