import type { Metadata } from "next";
import { getRecentActivity } from "@/app/actions/activity";
import { RecentActivityFeed } from "@/components/dashboard/RecentActivityFeed";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage(): Promise<React.ReactElement> {
  const result = await getRecentActivity(50);

  if (result.error) {
    return (
      <div className="space-y-8 animate-fade-in">
        <h1 className="text-2xl font-bold text-slate-900">Activity</h1>
        <p className="text-sm text-red-600">{result.error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Activity</h1>
      <div className="rounded-3xl border border-slate-200 bg-white px-4 py-1 shadow-sm">
        <RecentActivityFeed items={result.data ?? []} />
      </div>
    </div>
  );
}
