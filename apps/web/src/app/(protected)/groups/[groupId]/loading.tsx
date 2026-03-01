import { Skeleton } from "@/components/ui/Skeleton";

export default function GroupDetailLoading(): React.ReactElement {
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <Skeleton className="h-4 w-16 mb-2" />
        <Skeleton className="h-8 w-48" />
      </div>

      {/* Share card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <Skeleton className="h-3 w-32 mb-2" />
        <Skeleton className="h-5 w-64" />
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 pb-0">
        <div className="flex gap-4">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-5 w-32 mb-1" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
