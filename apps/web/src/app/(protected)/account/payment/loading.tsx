import { Skeleton } from "@/components/ui/Skeleton";

export default function PaymentSettingsLoading(): React.ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-48" />
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col gap-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-64" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-24 w-32 rounded-lg" />
          </div>
        </div>
      ))}
      <Skeleton className="h-10 w-32 rounded-lg" />
    </div>
  );
}
