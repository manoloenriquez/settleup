"use client";

import Link from "next/link";
import { computeInsights } from "@template/ai/insights";
import { useExpenseSummaries, useGroupRow, useMembersWithBalances } from "@/hooks/queries";
import { InsightsCurrencyNote, InsightsDashboard } from "@/components/groups/InsightsDashboard";
import { currencyOrPhp } from "@/lib/currency";
import type { CurrencyCode } from "@template/shared";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { ChevronRight, BarChart3 } from "lucide-react";

type Props = {
  groupId: string;
};

/**
 * Numeric insights render instantly from the cached expense summaries. The
 * narrative summary is an on-device feature of the iPhone app (Apple
 * Intelligence); the web shows the statistics only.
 *
 * Every total covers the group's default currency only: amounts in different
 * currencies are never added together or converted.
 */
export function InsightsPageClient({ groupId }: Props): React.ReactElement {
  const groupQ = useGroupRow(groupId);
  const group = groupQ.data ?? null;
  const currency: CurrencyCode | undefined = group ? currencyOrPhp(group.default_currency_code) : undefined;

  const summariesQ = useExpenseSummaries(groupId);
  const balancesQ = useMembersWithBalances(groupId, currency);

  const allSummaries = summariesQ.data ?? [];
  // Old cached rows may predate currencies; they were PHP.
  const summaries = allSummaries.filter((e) => currencyOrPhp(e.currency_code) === currency);
  const otherCurrencies = [
    ...new Set(allSummaries.map((e) => currencyOrPhp(e.currency_code)).filter((c) => c !== currency)),
  ].sort();
  const memberNameMap = new Map((balancesQ.data ?? []).map((b) => [b.member_id, b.display_name]));

  if (!group || !currency) {
    if (groupQ.isSuccess) {
      return (
        <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center animate-fade-in">
          <h2 className="text-lg font-bold text-slate-900">Group not found</h2>
          <Link href="/groups" className="mt-4 inline-flex text-sm font-semibold text-brand-600">
            Back to your groups
          </Link>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-6 animate-fade-in" aria-busy="true">
        <div className="h-8 w-48 rounded-xl bg-slate-100 animate-pulse" />
        <div className="h-64 rounded-3xl bg-slate-100 animate-pulse" />
      </div>
    );
  }

  const insights = computeInsights(
    summaries.map((e) => ({
      item_name: e.item_name,
      amount_cents: e.amount_cents,
      created_at: e.created_at,
      expense_date: e.expense_date,
      payer_names: (e.payers ?? []).map((p) => memberNameMap.get(p.member_id) ?? "Unknown"),
      category: e.category,
    })),
  );

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Breadcrumb */}
      <div>
        <nav className="flex items-center gap-1 text-xs text-slate-400 mb-3">
          <Link href="/groups" className="hover:text-slate-600 transition-colors font-medium">Groups</Link>
          <ChevronRight size={12} />
          <Link href={`/groups/${groupId}`} className="hover:text-slate-600 transition-colors font-medium truncate max-w-[160px]">{group.name}</Link>
          <ChevronRight size={12} />
          <span className="text-slate-600 font-medium">Insights</span>
        </nav>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
            <BarChart3 size={20} className="text-brand-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Insights</h1>
            <p className="text-sm text-slate-500 mt-0.5">{group.name}</p>
          </div>
        </div>
        <div className="mt-3">
          <InsightsCurrencyNote currency={currency} otherCurrencies={otherCurrencies} />
        </div>
      </div>

      {summariesQ.isSuccess && insights.total_expenses === 0 ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title={otherCurrencies.length > 0 ? `No expenses in ${currency} yet` : "No expenses yet"}
            description={
              otherCurrencies.length > 0
                ? `Insights cover expenses in ${currency} only. Add an expense in ${currency} to see them.`
                : "Add some expenses to see insights about your group spending."
            }
          />
        </Card>
      ) : (
        <InsightsDashboard insights={{ ...insights, llm_summary: null }} currency={currency} />
      )}
    </div>
  );
}
