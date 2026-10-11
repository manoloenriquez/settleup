"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { InvitePreview } from "@template/shared";
import { joinGroup, previewInvite } from "@/app/actions/collaboration";

interface Props {
  initialCode?: string;
}

export function JoinGroupForm({ initialCode }: Props): React.ReactElement {
  const router = useRouter();
  const [state, action, isPending] = useActionState(joinGroup, null);
  const [checking, startChecking] = useTransition();
  // Set when the group already lists someone with this person's name.
  const [nameTaken, setNameTaken] = useState<InvitePreview | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);

  useEffect(() => {
    if (state?.error) {
      toast.error(state.error);
    }
  }, [state]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    if (confirmed.current) return; // "Join as a new member": let the action run
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("invite_code") ?? "");
    startChecking(async () => {
      const preview = await previewInvite(code);
      if (preview.error === "preview_unavailable") {
        confirmed.current = true;
        formRef.current?.requestSubmit();
        return;
      }
      if (preview.error || !preview.data) {
        toast.error(preview.error ?? "The invite couldn't be checked.");
        return;
      }
      if (preview.data.already_member && preview.data.group_id) {
        toast.info(`You're already in ${preview.data.group_name}`);
        router.push(`/groups/${preview.data.group_id}`);
        return;
      }
      if (preview.data.name_taken) {
        setNameTaken(preview.data);
        return;
      }
      confirmed.current = true;
      formRef.current?.requestSubmit();
    });
  }

  const busy = isPending || checking;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <form ref={formRef} action={action} onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            onChange={() => {
              setNameTaken(null);
              confirmed.current = false;
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono
                       placeholder:text-slate-400 focus:outline-none focus:ring-2
                       focus:ring-brand-500 focus:border-transparent"
          />
          <p className="text-xs text-slate-500">
            Already listed in the group by name? Ask the organizer for your personal invite
            instead, so your expenses come with you.
          </p>
        </div>

        {nameTaken ? (
          <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">
              There&apos;s already a &ldquo;{nameTaken.your_name}&rdquo; in {nameTaken.group_name}
            </p>
            <p className="mt-1">
              Someone added {nameTaken.your_name} before you joined, and their expenses are under
              that entry. Ask the organizer to send you {nameTaken.your_name}&apos;s personal invite
              so they become yours. Joining with the code adds a second {nameTaken.your_name}.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => router.push("/groups")}
                className="flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 font-medium"
              >
                Don&apos;t join
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  confirmed.current = true;
                  formRef.current?.requestSubmit();
                }}
                className="flex-1 rounded-lg bg-amber-600 px-3 py-2 font-semibold text-white disabled:opacity-60"
              >
                Join as a new member
              </button>
            </div>
          </div>
        ) : (
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold
                       text-white shadow-sm hover:bg-brand-600 disabled:opacity-60
                       disabled:cursor-not-allowed transition-colors"
          >
            {busy ? "Joining…" : "Join Group"}
          </button>
        )}
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
