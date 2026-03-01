"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteExpense } from "@/app/actions/expenses";
import { formatCents } from "@template/shared";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Search, CreditCard, Users, Trash2, Receipt } from "lucide-react";
import type { GroupMember } from "@template/supabase";
import type { ExpenseWithParticipants } from "@/app/actions/expenses";

type Props = {
  expenses: ExpenseWithParticipants[];
  members: GroupMember[];
};

export function ExpenseList({ expenses, members }: Props): React.ReactElement {
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const router = useRouter();
  const memberMap = new Map(members.map((m) => [m.id, m.display_name]));

  const filtered = search.trim()
    ? expenses.filter((e) => e.item_name.toLowerCase().includes(search.toLowerCase()))
    : expenses;

  function handleDelete(): void {
    if (!deleteTarget) return;
    startTransition(async () => {
      await deleteExpense(deleteTarget);
      toast.success("Expense deleted");
      setDeleteTarget(null);
      router.refresh();
    });
  }

  const deleteTargetExpense = expenses.find((e) => e.id === deleteTarget);

  return (
    <div className="flex flex-col gap-3">
      {/* Search bar */}
      {expenses.length > 0 && (
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search expenses..."
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      )}

      {expenses.length === 0 && (
        <EmptyState
          icon={Receipt}
          title="No expenses yet"
          description="Add your first expense to start tracking splits."
        />
      )}

      {expenses.length > 0 && filtered.length === 0 && (
        <EmptyState
          icon={Search}
          title="No matching expenses"
          description={`No expenses match "${search}"`}
        />
      )}

      {filtered.map((expense) => (
        <div
          key={expense.id}
          className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-slate-900 truncate">
                {expense.item_name}
              </p>
              {expense.amount_cents < 0 && (
                <Badge variant="success">Credit</Badge>
              )}
              <span className="ml-auto text-sm font-bold text-slate-900 whitespace-nowrap">
                {formatCents(expense.amount_cents)}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              {expense.payers && expense.payers.length > 0 && (
                <span className="flex items-center gap-1">
                  <CreditCard size={12} />
                  {expense.payers
                    .map((p) => {
                      const name = memberMap.get(p.member_id) ?? p.member_id;
                      return expense.payers.length > 1
                        ? `${name} (${formatCents(p.paid_cents)})`
                        : name;
                    })
                    .join(", ")}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users size={12} />
                {expense.participants.length} people
              </span>
              <span>
                {new Date(expense.created_at).toLocaleDateString("en-PH")}
              </span>
            </div>
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setDeleteTarget(expense.id)}
            className="rounded-lg p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
            title="Delete expense"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete expense"
        description={`Delete "${deleteTargetExpense?.item_name ?? ""}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={handleDelete}
        isLoading={isPending}
      />
    </div>
  );
}
