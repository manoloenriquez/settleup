"use client";

import { useState } from "react";
import { formatCents, isEqualShareSplit } from "@template/shared";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Receipt, Users, CreditCard, ChevronDown, ChevronUp, List } from "lucide-react";
import type { GroupOverviewPayload } from "@template/shared";

type Props = {
  expenses: GroupOverviewPayload["expenses"];
};

type OverviewExpense = GroupOverviewPayload["expenses"][number];

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });
}

function getDayKey(dateStr: string): string {
  return new Date(dateStr).toDateString();
}

function splitLabel(exp: OverviewExpense): string {
  if (exp.items && exp.items.length > 0) return "Itemized";
  if (exp.participants.length === 0) return "No participants";
  return isEqualShareSplit(exp.participants.map((p) => p.share_cents))
    ? `Split equally between ${exp.participants.length}`
    : "Custom split";
}

function payerLine(exp: OverviewExpense): string | null {
  if (!exp.payers || exp.payers.length === 0) return null;
  const names = exp.payers.map((p) =>
    exp.payers!.length > 1 ? `${p.display_name} (${formatCents(p.paid_cents)})` : p.display_name,
  );
  return `Paid by ${names.join(", ")}`;
}

export function OverviewExpenseList({ expenses }: Props): React.ReactElement {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  function toggleExpanded(key: string): void {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const groups: { dayKey: string; label: string; expenses: { exp: OverviewExpense; key: string }[] }[] = [];
  for (const [i, exp] of expenses.entries()) {
    const dayKey = getDayKey(exp.created_at);
    const key = exp.id ?? `expense-${i}`;
    const last = groups[groups.length - 1];
    if (last && last.dayKey === dayKey) {
      last.expenses.push({ exp, key });
    } else {
      groups.push({ dayKey, label: formatDayLabel(exp.created_at), expenses: [{ exp, key }] });
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Expenses</h2>
        {expenses.length > 0 && (
          <p className="mt-1 text-xs text-slate-400 normal-case">
            Everything logged for this group — who paid and how each expense was split.
          </p>
        )}
      </CardHeader>
      <CardContent>
        {expenses.length === 0 ? (
          <EmptyState icon={Receipt} title="No expenses yet" description="Expenses will appear here once added." />
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <div key={group.dayKey}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    {group.label}
                  </span>
                  <div className="flex-1 h-px bg-slate-100" />
                  <span className="text-xs text-slate-400">
                    {formatCents(group.expenses.reduce((s, e) => s + e.exp.amount_cents, 0))}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {group.expenses.map(({ exp, key }) => {
                    const isCredit = exp.amount_cents < 0;
                    const isExpanded = expandedKeys.has(key);
                    const paidBy = payerLine(exp);
                    const hasDetail = exp.participants.length > 0 || (exp.items?.length ?? 0) > 0;

                    return (
                      <div key={key} className="rounded-xl border border-slate-100 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => hasDetail && toggleExpanded(key)}
                          aria-expanded={isExpanded}
                          className={`w-full p-3 text-left ${hasDetail ? "hover:bg-slate-50/70 transition-colors" : "cursor-default"}`}
                        >
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="font-medium text-slate-800 min-w-0 truncate">
                              {exp.item_name}
                              {isCredit && (
                                <Badge variant="success" className="ml-2">
                                  Credit
                                </Badge>
                              )}
                            </span>
                            <span className="flex items-center gap-1.5 shrink-0">
                              <span className={`font-semibold ${isCredit ? "text-green-600" : "text-slate-700"}`}>
                                {formatCents(exp.amount_cents)}
                              </span>
                              {hasDetail &&
                                (isExpanded ? (
                                  <ChevronUp size={13} className="text-slate-400" />
                                ) : (
                                  <ChevronDown size={13} className="text-slate-400" />
                                ))}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-400">
                            {paidBy && (
                              <span className="flex items-center gap-1">
                                <CreditCard size={11} />
                                {paidBy}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Users size={11} />
                              {splitLabel(exp)}
                            </span>
                            {exp.items && exp.items.length > 0 && (
                              <span className="flex items-center gap-1">
                                <List size={11} />
                                {exp.items.length} item{exp.items.length !== 1 ? "s" : ""}
                              </span>
                            )}
                            {exp.category && (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2 py-0.5 font-medium text-slate-600">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: exp.category.color }} />
                                {exp.category.name}
                              </span>
                            )}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-slate-100 bg-slate-50 px-3 py-3 flex flex-col gap-3 text-xs">
                            {exp.participants.length > 0 && (
                              <div>
                                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
                                  Each person&apos;s share
                                </p>
                                <div className="flex flex-col gap-1">
                                  {exp.participants.map((p, j) => (
                                    <div key={j} className="flex items-center justify-between gap-3">
                                      <span className="text-slate-600 truncate">{p.display_name}</span>
                                      <span className="font-medium text-slate-700 whitespace-nowrap">
                                        {formatCents(p.share_cents)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {exp.items && exp.items.length > 0 && (
                              <div>
                                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
                                  Line items
                                </p>
                                <div className="flex flex-col gap-1.5">
                                  {exp.items.map((item, j) => (
                                    <div key={j} className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="font-medium text-slate-700">{item.name}</p>
                                        {item.participants && item.participants.length > 0 && (
                                          <p className="text-slate-400 mt-0.5">
                                            {item.participants
                                              .map((ip) => `${ip.display_name} (${formatCents(ip.share_cents)})`)
                                              .join(", ")}
                                          </p>
                                        )}
                                      </div>
                                      <span className="font-semibold text-slate-700 whitespace-nowrap shrink-0">
                                        {formatCents(item.amount_cents)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
