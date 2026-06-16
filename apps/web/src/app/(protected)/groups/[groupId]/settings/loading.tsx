import { Skeleton } from "@/components/ui/Skeleton";

export default function GroupSettingsLoading(): React.ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-36" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col gap-4">
          <Skeleton className="h-5 w-40" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full rounded-lg" />
            {i === 1 && (
              <>
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
