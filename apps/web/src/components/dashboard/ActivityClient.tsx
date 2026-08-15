"use client";

import { useRecentActivity } from "@/hooks/queries";
import { RecentActivityFeed } from "@/components/dashboard/RecentActivityFeed";

export function ActivityClient(): React.ReactElement {
  const activityQ = useRecentActivity(50);

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Activity</h1>
      {activityQ.isError && !activityQ.data ? (
        <p className="text-sm text-red-600">{activityQ.error.message}</p>
      ) : !activityQ.data ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <div className="h-16 rounded-2xl bg-slate-100 animate-pulse" />
          <div className="h-16 rounded-2xl bg-slate-100 animate-pulse" />
          <div className="h-16 rounded-2xl bg-slate-100 animate-pulse" />
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white px-4 py-1 shadow-sm">
          <RecentActivityFeed items={activityQ.data} />
        </div>
      )}
    </div>
  );
}
