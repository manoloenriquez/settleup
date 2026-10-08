/**
 * Shown when a shared Talli link can't be opened: it was turned off or
 * replaced, mistyped, or opened too many times in a few minutes. Visitors
 * usually have no account, so there is nothing to sign in to — only who to ask.
 */
export function LinkUnavailable({ kind }: { kind: "group" | "personal" }): React.ReactElement {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600">
          <span className="text-xl font-bold text-white">T</span>
        </div>
        <h1 className="mb-2 text-xl font-bold text-slate-900">This link isn&apos;t working</h1>
        <p className="mb-3 text-base text-slate-600">
          {kind === "group"
            ? "The group's shared link may have been turned off or replaced with a new one."
            : "This balance link may have been replaced with a new one."}{" "}
          Ask the person who sent it for a fresh link.
        </p>
        <p className="text-sm text-slate-500">
          Opened it many times just now? Wait a few minutes and try again.
        </p>
      </div>
    </div>
  );
}
