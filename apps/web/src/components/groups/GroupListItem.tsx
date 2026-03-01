"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { toast } from "sonner";
import { deleteGroup } from "@/app/actions/groups";
import { formatCents } from "@template/shared";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { Users, Trash2 } from "lucide-react";
import type { GroupWithStats } from "@template/shared";

type Props = {
  group: GroupWithStats;
};

function StatusBadge({ group }: { group: GroupWithStats }): React.ReactElement {
  if (group.member_count === 0) {
    return <Badge variant="neutral">No members</Badge>;
  }
  if (group.pending_count > 0) {
    return (
      <Badge variant="warning">
        {group.pending_count} pending &middot; {formatCents(group.total_owed_cents)}
      </Badge>
    );
  }
  return <Badge variant="success">All settled</Badge>;
}

export function GroupListItem({ group }: Props): React.ReactElement {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showDelete, setShowDelete] = useState(false);

  function handleDelete(): void {
    startTransition(async () => {
      await deleteGroup(group.id);
      toast.success(`"${group.name}" deleted`);
      setShowDelete(false);
      router.refresh();
    });
  }

  const createdAt = new Date(group.created_at).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <>
      <div
        className={`flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:border-slate-300 transition-all${isPending ? " opacity-50" : ""}`}
      >
        <div className="rounded-lg bg-indigo-50 p-2 shrink-0">
          <Users size={16} className="text-indigo-600" />
        </div>
        <Link href={`/groups/${group.id}`} className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-900">{group.name}</p>
          <p className="text-xs text-slate-400">
            {createdAt} &middot; {group.member_count} members
          </p>
        </Link>

        <StatusBadge group={group} />

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            setShowDelete(true);
          }}
          disabled={isPending}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:pointer-events-none"
          aria-label={`Delete ${group.name}`}
        >
          <Trash2 size={16} />
        </button>
      </div>

      <Dialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        title="Delete group"
        description={`Delete "${group.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={handleDelete}
        isLoading={isPending}
      />
    </>
  );
}
