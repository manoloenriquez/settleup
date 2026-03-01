export default function InsightsLoading(): React.ReactElement {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div>
        <div className="h-4 w-24 rounded bg-slate-200" />
        <div className="h-8 w-40 rounded bg-slate-200 mt-2" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-slate-100" />
              <div className="flex-1">
                <div className="h-3 w-16 rounded bg-slate-100 mb-1.5" />
                <div className="h-5 w-20 rounded bg-slate-200" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
