"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteGroup } from "@/app/actions/groups";
import { formatCents } from "@template/shared";
import type { GroupWithStats } from "@template/shared";

type Props = {
  group: GroupWithStats;
};

function StatusBadge({ group }: { group: GroupWithStats }): React.ReactElement {
  if (group.member_count === 0) {
    return (
      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
        No members
      </span>
    );
  }
  if (group.pending_count > 0) {
    return (
      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
        {group.pending_count} pending · {formatCents(group.total_owed_cents)}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
      All settled
    </span>
  );
}

export function GroupListItem({ group }: Props): React.ReactElement {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete(e: React.MouseEvent): void {
    e.preventDefault();
    if (!window.confirm(`Delete "${group.name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      await deleteGroup(group.id);
      router.refresh();
    });
  }

  const createdAt = new Date(group.created_at).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-opacity${isPending ? " opacity-50" : ""}`}
    >
      <Link href={`/groups/${group.id}`} className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">{group.name}</p>
        <p className="text-xs text-slate-400">{createdAt}</p>
      </Link>

      <StatusBadge group={group} />

      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none"
        aria-label={`Delete ${group.name}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      </button>
    </div>
  );
}
