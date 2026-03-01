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
            <div className="rounded-lg bg-indigo-50 p-2">
              <Receipt size={18} className="text-indigo-600" />
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

      {/* LLM Summary */}
      {insights.llm_summary && (
        <Card>
          <CardContent>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-indigo-500" />
              <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">
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
