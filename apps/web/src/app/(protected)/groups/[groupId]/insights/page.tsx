import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGroupInsights } from "@/app/actions/insights";
import { InsightsDashboard } from "@/components/groups/InsightsDashboard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { ArrowLeft, BarChart3 } from "lucide-react";

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
      <div>
        <Link
          href={`/groups/${groupId}`}
          className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
        >
          <ArrowLeft size={14} />
          {group.name}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">Insights</h1>
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
