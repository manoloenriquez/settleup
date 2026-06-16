"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { joinGroup } from "@/app/actions/collaboration";

interface Props {
  initialCode?: string;
}

export function JoinGroupForm({ initialCode }: Props): React.ReactElement {
  const router = useRouter();
  const [state, action, isPending] = useActionState(joinGroup, null);

  useEffect(() => {
    if (state?.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <form action={action} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="invite_code" className="text-sm font-medium text-slate-700">
            Invite Code
          </label>
          <input
            id="invite_code"
            name="invite_code"
            type="text"
            defaultValue={initialCode ?? ""}
            placeholder="e.g. 3a9f2b4c1d8e"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono
                       placeholder:text-slate-400 focus:outline-none focus:ring-2
                       focus:ring-brand-500 focus:border-transparent"
          />
          <p className="text-xs text-slate-500">
            Ask your group admin to share the invite code from the group settings page.
          </p>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold
                     text-white shadow-sm hover:bg-brand-500 disabled:opacity-60
                     disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Joining…" : "Join Group"}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-slate-500">
        Already a member?{" "}
        <button
          type="button"
          onClick={() => router.push("/groups")}
          className="font-medium text-brand-600 hover:underline"
        >
          View your groups
        </button>
      </p>
    </div>
  );
}
