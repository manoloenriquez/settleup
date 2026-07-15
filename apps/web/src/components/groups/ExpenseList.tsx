"use client";

import { useTransition, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteExpense, listExpenses, updateExpense, updateItemizedExpense } from "@/app/actions/expenses";
import { formatCents, parsePHPAmount, DEFAULT_CATEGORY_COLOR } from "@template/shared";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { CategorySelect } from "./CategoryControls";
import { CategoryIconTile } from "./CategoryIcon";
import { Search, Trash2, Pencil, Receipt, List, ChevronDown, ChevronUp, MessageCircle } from "lucide-react";
import { CommentThread } from "./CommentThread";
import type { ExpenseCategory, GroupMember } from "@template/supabase";
import type { ExpenseWithParticipants } from "@/app/actions/expenses";

type Props = {
  /** First page of expenses, freshest first (re-delivered on every server refresh). */
  expenses: ExpenseWithParticipants[];
  members: GroupMember[];
  categories: ExpenseCategory[];
  currentUserId: string;
  isAdminOrOwner: boolean;
  groupId: string;
  totalCount: number;
  pageSize: number;
};

/** Parse YYYY-MM-DD as a local date; new Date("YYYY-MM-DD") is UTC midnight (a day off in PH). */
function parseDateLike(dateStr: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Date(dateStr);
}

function formatDayLabel(dateStr: string): string {
  const d = parseDateLike(dateStr);
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
  return parseDateLike(dateStr).toDateString();
}

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

function isEqualSplit(expense: ExpenseWithParticipants): boolean {
  if ((expense.items?.length ?? 0) > 0 || expense.participants.length === 0) {
    return false;
  }

  const shares = expense.participants.map((participant) => participant.share_cents).sort((a, b) => a - b);
  return shares[shares.length - 1]! - shares[0]! <= 1;
}

export function ExpenseList({ expenses, members, categories, currentUserId, isAdminOrOwner, groupId, totalCount, pageSize }: Props): React.ReactElement {
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [extraExpenses, setExtraExpenses] = useState<ExpenseWithParticipants[]>([]);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<ExpenseWithParticipants | null>(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [commentIds, setCommentIds] = useState<Set<string>>(new Set());

  function toggleComments(id: string): void {
    setCommentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

  // Server refreshes (realtime, mutations) re-deliver page 1 via props;
  // dedupe by id so previously loaded extra pages don't repeat rows.
  const allExpenses = useMemo(() => {
    const seen = new Set(expenses.map((e) => e.id));
    return [...expenses, ...extraExpenses.filter((e) => !seen.has(e.id))];
  }, [expenses, extraExpenses]);
  const hasMore = allExpenses.length < totalCount;

  function handleLoadMore(): void {
    if (loadingMore) return;
    setLoadingMore(true);
    void (async () => {
      const result = await listExpenses(groupId, page + 1, pageSize);
      if (result.error || !result.data) {
        toast.error(result.error ?? "Failed to load more expenses.");
      } else {
        const nextRows = result.data.data;
        setExtraExpenses((prev) => {
          const seen = new Set([...expenses, ...prev].map((e) => e.id));
          return [...prev, ...nextRows.filter((e) => !seen.has(e.id))];
        });
        setPage((prev) => prev + 1);
      }
      setLoadingMore(false);
    })();
  }

  const filtered = search.trim()
    ? allExpenses.filter((e) => e.item_name.toLowerCase().includes(search.toLowerCase()))
    : allExpenses;

  // Group by day
  const groups: { dayKey: string; label: string; expenses: ExpenseWithParticipants[] }[] = [];
  for (const expense of filtered) {
    const day = expense.expense_date ?? expense.created_at;
    const dayKey = getDayKey(day);
    const existing = groups.find((g) => g.dayKey === dayKey);
    if (existing) {
      existing.expenses.push(expense);
    } else {
      groups.push({ dayKey, label: formatDayLabel(day), expenses: [expense] });
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

  function canEditExpense(expense: ExpenseWithParticipants): boolean {
    return isAdminOrOwner || expense.created_by_user_id === currentUserId;
  }

  function openEdit(expense: ExpenseWithParticipants): void {
    if (expense.amount_cents < 0) {
      toast.error("Credits are not editable from this screen yet.");
      return;
    }

    setEditTarget(expense);
    setEditName(expense.item_name);
    setEditAmount(formatCents(Math.abs(expense.amount_cents)).replace(/[₱,]/g, ""));
    setEditDate(expense.expense_date ?? "");
    setEditCategoryId(expense.category_id);
  }

  function handleEdit(): void {
    if (!editTarget) return;
    const amountCents = parsePHPAmount(editAmount);
    if (!amountCents || amountCents <= 0) {
      toast.error("Invalid amount");
      return;
    }
    startTransition(async () => {
      const payerAmounts = scalePositiveAmounts(
        editTarget.payers.map((payer) => payer.paid_cents),
        amountCents,
      );
      if (!payerAmounts) {
        toast.error("Amount is too small to preserve payer contributions.");
        return;
      }

      const customSplitAmounts = (editTarget.items?.length ?? 0) > 0 || isEqualSplit(editTarget)
        ? null
        : scalePositiveAmounts(
            editTarget.participants.map((participant) => participant.share_cents),
            amountCents,
          );
      if ((editTarget.items?.length ?? 0) === 0 && !isEqualSplit(editTarget) && !customSplitAmounts) {
        toast.error("Amount is too small to preserve custom splits.");
        return;
      }

      const result = (editTarget.items?.length ?? 0) > 0
        ? await (async () => {
            const items = editTarget.items ?? [];
            const itemAmounts = scalePositiveAmounts(
              items.map((item) => item.amount_cents),
              amountCents,
            );
            if (!itemAmounts) {
              return { data: null, error: "Amount is too small to preserve itemized shares." };
            }

            return updateItemizedExpense({
              expense_id: editTarget.id,
              category_id: editCategoryId,
              item_name: editName.trim(),
              amount_cents: amountCents,
              notes: editTarget.notes ?? undefined,
              expense_date: editDate || undefined,
              payers: editTarget.payers.map((payer, index) => ({
                member_id: payer.member_id,
                paid_cents: payerAmounts[index]!,
              })),
              line_items: items.map((item, index) => ({
                name: item.name,
                amount_cents: itemAmounts[index]!,
                participant_ids: item.item_participants.map((participant) => participant.member_id),
              })),
            });
          })()
        : await updateExpense({
            expense_id: editTarget.id,
            category_id: editCategoryId,
            item_name: editName.trim(),
            amount_cents: amountCents,
            notes: editTarget.notes ?? undefined,
            expense_date: editDate || undefined,
            split_mode: isEqualSplit(editTarget) ? "equal" : "custom",
            participant_ids: editTarget.participants.map((participant) => participant.member_id),
            custom_splits: isEqualSplit(editTarget)
              ? undefined
              : editTarget.participants.map((participant, index) => ({
                  member_id: participant.member_id,
                  share_cents: customSplitAmounts![index]!,
                })),
            payers: editTarget.payers.map((payer, index) => ({
              member_id: payer.member_id,
              paid_cents: payerAmounts[index]!,
            })),
          });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Expense updated");
      setEditTarget(null);
      router.refresh();
    });
  }

  const deleteTargetExpense = allExpenses.find((e) => e.id === deleteTarget);

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
          description={`No expenses match "${search}"${hasMore ? ` in the ${allExpenses.length} loaded expenses — load more to widen the search` : ""}`}
        />
      )}

      {search.trim() && filtered.length > 0 && hasMore && (
        <p className="text-xs text-slate-400">
          Searching the {allExpenses.length} loaded expenses — load more below to widen the search.
        </p>
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
              const participantNames = expense.participants.map(
                (p) => memberMap.get(p.member_id) ?? "Unknown",
              );
              const splitLabel =
                (expense.items?.length ?? 0) > 0
                  ? "Itemized"
                  : isEqualSplit(expense)
                    ? "Split equally"
                    : "Custom split";

              return (
                <div
                  key={expense.id}
                  className="rounded-2xl border border-slate-200 bg-white overflow-hidden hover:border-slate-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-3 p-4">
                    {/* Category icon tile */}
                    <CategoryIconTile
                      icon={isCredit ? "receipt" : expense.category?.icon}
                      color={isCredit ? "#059669" : expense.category?.color ?? DEFAULT_CATEGORY_COLOR}
                      size="sm"
                    />

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
                      <p className="mt-0.5 truncate text-xs text-slate-400">
                        {payerNames} paid · {relativeTime(expense.created_at)}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="flex -space-x-1">
                          {participantNames.slice(0, 4).map((name, i) => (
                            <Avatar key={i} name={name} size="xs" className="ring-1 ring-white" />
                          ))}
                        </span>
                        <span className="text-xs text-slate-400">{splitLabel}</span>
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

                    {/* Comments + Edit + Delete */}
                    <div className="flex gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleComments(expense.id)}
                        className={`rounded-xl p-1.5 transition-colors ${commentIds.has(expense.id) ? "text-brand-600 bg-brand-50" : "text-slate-300 hover:text-brand-600 hover:bg-brand-50"}`}
                        title="Comments"
                        aria-label={`Comments on ${expense.item_name}`}
                        aria-expanded={commentIds.has(expense.id)}
                      >
                        <MessageCircle size={15} />
                      </button>
                      {canEditExpense(expense) && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => openEdit(expense)}
                          className="rounded-xl p-1.5 text-slate-300 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-50"
                          title="Edit expense"
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => setDeleteTarget(expense.id)}
                        className="rounded-xl p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                        title="Delete expense"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
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

                  {/* Comment thread */}
                  {commentIds.has(expense.id) && (
                    <CommentThread expenseId={expense.id} members={members} currentUserId={currentUserId} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Load more */}
      {hasMore && (
        <button
          type="button"
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="mx-auto rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : `Load more (${allExpenses.length} of ${totalCount})`}
        </button>
      )}

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

      {/* Edit expense dialog */}
      <Dialog
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
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
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Expense name"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="edit-amount">Amount</label>
            <Input
              id="edit-amount"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
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
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <CategorySelect categories={categories} value={editCategoryId} onChange={setEditCategoryId} />
        </div>
      </Dialog>
    </div>
  );
}
