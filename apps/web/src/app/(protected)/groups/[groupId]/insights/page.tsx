import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGroupInsights } from "@/app/actions/insights";
import { InsightsDashboard } from "@/components/groups/InsightsDashboard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { ChevronRight, BarChart3 } from "lucide-react";

type Props = {
  params: Promise<{ groupId: string }>;
};

export default async function GroupInsightsPage({ params }: Props): Promise<React.ReactElement> {
  const { groupId } = await params;
  const supabase = await createClient();

  const { data: group } = await supabase
    .schema("settleup")
    .from("groups")
    .select("id, name")
    .eq("id", groupId)
    .single();

  if (!group) notFound();

  const result = await getGroupInsights(groupId);

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

      {result.error ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="Could not load insights"
            description={result.error}
          />
        </Card>
      ) : result.data && result.data.total_expenses === 0 ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="No expenses yet"
            description="Add some expenses to see insights about your group spending."
          />
        </Card>
      ) : result.data ? (
        <InsightsDashboard insights={result.data} />
      ) : null}
    </div>
  );
}
