"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { computeInsights } from "@template/ai/insights";
import { getGroupInsights } from "@/app/actions/insights";
import { useExpenseSummaries, useGroupRow, useMembersWithBalances } from "@/hooks/queries";
import { InsightsDashboard } from "@/components/groups/InsightsDashboard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { ChevronRight, BarChart3, Sparkles } from "lucide-react";

type Props = {
  groupId: string;
};

/**
 * Numeric insights render instantly from the cached expense summaries; the
 * LLM summary (rate-limited, seconds-slow) streams in after paint via its own
 * query — "insights" is in NON_PERSISTED_KEYS so AI output never persists.
 */
export function InsightsPageClient({ groupId }: Props): React.ReactElement {
  const groupQ = useGroupRow(groupId);
  const summariesQ = useExpenseSummaries(groupId);
  const balancesQ = useMembersWithBalances(groupId);

  const summaries = summariesQ.data ?? [];
  const memberNameMap = new Map((balancesQ.data ?? []).map((b) => [b.member_id, b.display_name]));

  const llmQ = useQuery({
    queryKey: ["insights", groupId],
    queryFn: async () => {
      const result = await getGroupInsights(groupId);
      if (result.error !== null) throw new Error(result.error);
      return result.data?.llm_summary ?? null;
    },
    staleTime: Infinity,
    retry: 0,
    enabled: summaries.length > 0,
  });

  const group = groupQ.data ?? null;

  if (!group) {
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
      </div>

      {summariesQ.isSuccess && insights.total_expenses === 0 ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="No expenses yet"
            description="Add some expenses to see insights about your group spending."
          />
        </Card>
      ) : (
        <>
          {llmQ.isFetching && (
            <p className="flex items-center gap-2 rounded-2xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm text-brand-700">
              <Sparkles size={15} className="animate-pulse" />
              Generating AI summary…
            </p>
          )}
          <InsightsDashboard insights={{ ...insights, llm_summary: llmQ.data ?? null }} />
        </>
      )}
    </div>
  );
}
