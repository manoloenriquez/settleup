"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useTransition, useState } from "react";
import { toast } from "sonner";
import { archiveGroup } from "@/app/actions/groups";
import { formatCents } from "@template/shared";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { Users, Archive } from "lucide-react";
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
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [showDelete, setShowDelete] = useState(false);

  function handleDelete(): void {
    startTransition(async () => {
      const result = await archiveGroup(group.id);
      if (result.error) {
        toast.error(result.error);
        setShowDelete(false);
        return;
      }
      toast.success(`"${group.name}" archived`);
      setShowDelete(false);
      void queryClient.invalidateQueries({ queryKey: ["groups"] });
      void queryClient.invalidateQueries({ queryKey: ["archivedGroups"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
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
        className={`flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 hover:border-brand-200 hover:shadow-md transition-all${isPending ? " opacity-50" : ""}`}
      >
        <div className="rounded-xl bg-brand-50 p-2.5 shrink-0">
          <Users size={16} className="text-brand-600" />
        </div>
        <Link href={`/groups/${group.id}`} className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">{group.name}</p>
          <p className="text-xs text-slate-400">
            {createdAt} &middot; {group.member_count} member{group.member_count !== 1 ? "s" : ""}
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
          className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors disabled:pointer-events-none"
          aria-label={`Archive ${group.name}`}
        >
          <Archive size={16} />
        </button>
      </div>

      <Dialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        title="Archive group"
        description={`Archive "${group.name}"? You can restore it later from the groups page.`}
        confirmLabel="Archive"
        confirmVariant="danger"
        onConfirm={handleDelete}
        isLoading={isPending}
      />
    </>
  );
}
