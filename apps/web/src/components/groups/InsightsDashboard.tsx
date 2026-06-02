import { formatCents } from "@template/shared";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { TrendingUp, Receipt, DollarSign, Crown, Repeat, Calendar, Sparkles } from "lucide-react";
import type { InsightsSummary } from "@template/shared/types";

type Props = {
  insights: InsightsSummary;
};

export function InsightsDashboard({ insights }: Props): React.ReactElement {
  return (
    <div className="flex flex-col gap-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="rounded-lg bg-brand-50 p-2">
              <Receipt size={18} className="text-brand-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Total Expenses</p>
              <p className="text-lg font-bold text-slate-900">{insights.total_expenses}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-50 p-2">
              <DollarSign size={18} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Total Spent</p>
              <p className="text-lg font-bold text-slate-900">
                {formatCents(insights.total_amount_cents)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-50 p-2">
              <TrendingUp size={18} className="text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Average</p>
              <p className="text-lg font-bold text-slate-900">
                {formatCents(insights.average_expense_cents)}
              </p>
            </div>
          </CardContent>
        </Card>

        {insights.top_spender && (
          <Card>
            <CardContent className="flex items-center gap-3">
              <div className="rounded-lg bg-yellow-50 p-2">
                <Crown size={18} className="text-yellow-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Top Spender</p>
                <p className="text-sm font-bold text-slate-900">{insights.top_spender.name}</p>
                <p className="text-xs text-slate-500">
                  {formatCents(insights.top_spender.amount_cents)}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {insights.most_common_item && (
          <Card>
            <CardContent className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-50 p-2">
                <Repeat size={18} className="text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Most Common</p>
                <p className="text-sm font-bold text-slate-900 capitalize">
                  {insights.most_common_item.name}
                </p>
                <p className="text-xs text-slate-500">
                  {insights.most_common_item.count} times
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {insights.period && (
          <Card>
            <CardContent className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2">
                <Calendar size={18} className="text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Period</p>
                <p className="text-xs font-medium text-slate-700">
                  {new Date(insights.period.first_expense).toLocaleDateString("en-PH")} —{" "}
                  {new Date(insights.period.last_expense).toLocaleDateString("en-PH")}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {insights.categories.length > 0 && (
        <Card>
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-900">Spending by category</p>
                {insights.top_category && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    Top: {insights.top_category.name} · {formatCents(insights.top_category.amount_cents)}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {insights.categories.map((category) => {
                const pct = insights.total_amount_cents > 0
                  ? Math.round((category.amount_cents / insights.total_amount_cents) * 100)
                  : 0;
                return (
                  <div key={category.slug} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2 font-medium text-slate-700">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                        <span className="truncate">{category.name}</span>
                      </span>
                      <span className="shrink-0 font-semibold text-slate-900">{formatCents(category.amount_cents)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: category.color }} />
                    </div>
                    <p className="text-xs text-slate-400">{category.expense_count} expense{category.expense_count !== 1 ? "s" : ""} · {pct}%</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* LLM Summary */}
      {insights.llm_summary && (
        <Card>
          <CardContent>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-brand-500" />
              <span className="text-xs font-semibold text-brand-700 uppercase tracking-wide">
                AI Summary
              </span>
              <Badge variant="neutral">AI-assisted</Badge>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">
              {insights.llm_summary}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
