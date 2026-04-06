"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteExpense } from "@/app/actions/expenses";
import { formatCents } from "@template/shared";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Search, CreditCard, Users, Trash2, Receipt, Clock, List, ChevronDown, ChevronUp } from "lucide-react";
import type { GroupMember } from "@template/supabase";
import type { ExpenseWithParticipants } from "@/app/actions/expenses";

type Props = {
  expenses: ExpenseWithParticipants[];
  members: GroupMember[];
};

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateStr).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

function getDayKey(dateStr: string): string {
  return new Date(dateStr).toDateString();
}

export function ExpenseList({ expenses, members }: Props): React.ReactElement {
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string): void {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const router = useRouter();
  const memberMap = new Map(members.map((m) => [m.id, m.display_name]));

  const filtered = search.trim()
    ? expenses.filter((e) => e.item_name.toLowerCase().includes(search.toLowerCase()))
    : expenses;

  // Group by day
  const groups: { dayKey: string; label: string; expenses: ExpenseWithParticipants[] }[] = [];
  for (const expense of filtered) {
    const dayKey = getDayKey(expense.created_at);
    const existing = groups.find((g) => g.dayKey === dayKey);
    if (existing) {
      existing.expenses.push(expense);
    } else {
      groups.push({ dayKey, label: formatDayLabel(expense.created_at), expenses: [expense] });
    }
  }

  function handleDelete(): void {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteExpense(deleteTarget);
      if (result.error) {
        toast.error(result.error);
        setDeleteTarget(null);
        return;
      }
      toast.success("Expense deleted");
      setDeleteTarget(null);
      router.refresh();
    });
  }

  const deleteTargetExpense = expenses.find((e) => e.id === deleteTarget);

  return (
    <div className="flex flex-col gap-4">
      {/* Search bar */}
      {expenses.length > 0 && (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search expenses"
            placeholder="Search expenses..."
            className="pl-9"
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

      {/* Date-grouped expense rows */}
      {groups.map((group) => (
        <div key={group.dayKey}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
              {group.label}
            </span>
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-xs text-slate-400">
              {formatCents(group.expenses.reduce((s, e) => s + e.amount_cents, 0))}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {group.expenses.map((expense) => {
              const payerNames = expense.payers
                .map((p) => {
                  const name = memberMap.get(p.member_id) ?? "Unknown";
                  return expense.payers.length > 1
                    ? `${name} (${formatCents(p.paid_cents)})`
                    : name;
                })
                .join(", ");

              const isCredit = expense.amount_cents < 0;
              const isExpanded = expandedIds.has(expense.id);

              return (
                <div
                  key={expense.id}
                  className="rounded-2xl border border-slate-200 bg-white overflow-hidden hover:border-slate-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-3 p-4">
                    {/* Icon area */}
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${isCredit ? "bg-emerald-50" : "bg-brand-50"}`}>
                      <Receipt size={18} className={isCredit ? "text-emerald-500" : "text-brand-500"} />
                    </div>

                    {/* Name + meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900 truncate text-sm leading-tight">
                          {expense.item_name}
                        </p>
                        {isCredit && (
                          <span className="shrink-0 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                            Credit
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <CreditCard size={11} />
                          {payerNames}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users size={11} />
                          {expense.participants.length}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {relativeTime(expense.created_at)}
                        </span>
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="text-right shrink-0">
                      <p className={`text-base font-extrabold tracking-tight ${isCredit ? "text-emerald-600" : "text-slate-900"}`}>
                        {formatCents(Math.abs(expense.amount_cents))}
                      </p>
                      {expense.items && expense.items.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(expense.id)}
                          className="text-xs text-slate-400 hover:text-brand-600 flex items-center gap-0.5 mt-0.5 ml-auto transition-colors"
                        >
                          <List size={11} />
                          {expense.items.length}
                          {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        </button>
                      )}
                    </div>

                    {/* Delete */}
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setDeleteTarget(expense.id)}
                      className="rounded-xl p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50 shrink-0"
                      title="Delete expense"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  {/* Item breakdown */}
                  {expense.items && expense.items.length > 0 && isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 flex flex-col gap-2">
                      {expense.items.map((item, idx) => {
                        const participants = item.item_participants
                          .map((ip) => {
                            const name = memberMap.get(ip.member_id) ?? "Unknown";
                            return `${name} (${formatCents(ip.share_cents)})`;
                          })
                          .join(", ");
                        return (
                          <div key={idx} className="flex items-start justify-between gap-4 text-xs">
                            <div className="min-w-0">
                              <p className="font-medium text-slate-700">{item.name}</p>
                              {participants && (
                                <p className="text-slate-400 mt-0.5 truncate">{participants}</p>
                              )}
                            </div>
                            <span className="font-semibold text-slate-700 whitespace-nowrap shrink-0">
                              {formatCents(item.amount_cents)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
