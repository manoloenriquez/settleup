"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setRecurringExpenseActive, deleteRecurringExpense } from "@/app/actions/recurring";
import type { RecurringExpense } from "@/app/actions/recurring";
import { formatCents } from "@template/shared";
import { Button } from "@/components/ui/Button";
import { Repeat, Trash2, Pause, Play } from "lucide-react";
import type { GroupMember } from "@template/supabase";

type Props = {
  recurring: RecurringExpense[];
  members: GroupMember[];
};

export function RecurringExpensesSection({ recurring, members }: Props): React.ReactElement {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const memberMap = new Map(members.map((m) => [m.id, m.display_name]));

  function handleToggle(item: RecurringExpense): void {
    startTransition(async () => {
      const result = await setRecurringExpenseActive(item.id, !item.active);
      if (result.error) toast.error(result.error);
      else {
        toast.success(item.active ? "Recurring expense paused" : "Recurring expense resumed");
        router.refresh();
      }
    });
  }

  function handleDelete(item: RecurringExpense): void {
    startTransition(async () => {
      const result = await deleteRecurringExpense(item.id);
      if (result.error) toast.error(result.error);
      else {
        toast.success("Recurring expense removed");
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900 mb-1 flex items-center gap-2">
        <Repeat size={16} className="text-brand-500" />
        Recurring Expenses
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        Added automatically on schedule. Create one from Add Expense → Detailed → Repeats.
      </p>

      {recurring.length === 0 ? (
        <p className="text-sm text-slate-400">No recurring expenses yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {recurring.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 rounded-xl border p-3 ${item.active ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-70"}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">
                  {item.item_name}{" "}
                  <span className="font-normal text-slate-500">· {formatCents(item.amount_cents)}</span>
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {item.cadence === "weekly" ? "Weekly" : "Monthly"} · paid by{" "}
                  {memberMap.get(item.payer_member_id) ?? "Unknown"} · next{" "}
                  {new Date(item.next_run_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                  {!item.active && " · paused"}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                leftIcon={item.active ? Pause : Play}
                disabled={isPending}
                onClick={() => handleToggle(item)}
              >
                {item.active ? "Pause" : "Resume"}
              </Button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleDelete(item)}
                className="rounded-xl p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                title="Delete recurring expense"
                aria-label={`Delete recurring expense ${item.item_name}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
