import { Skeleton } from "@/components/ui/Skeleton";

export default function NewGroupLoading(): React.ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-48" />
      <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col gap-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>
    </div>
  );
}
