"use client";

import { useTransition, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArchiveRestore, ChevronDown, ChevronRight } from "lucide-react";
import { restoreGroup } from "@/app/actions/groups";
import { Button } from "@/components/ui/Button";
import type { Group } from "@template/supabase";

type Props = {
  groups: Group[];
};

function invalidateGroupsLists(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["groups"] });
  void queryClient.invalidateQueries({ queryKey: ["archivedGroups"] });
  void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
}

export function ArchivedGroupsSection({ groups }: Props): React.ReactElement | null {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);

  if (groups.length === 0) return null;

  function handleRestore(group: Group): void {
    startTransition(async () => {
      const result = await restoreGroup(group.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`"${group.name}" restored`);
        invalidateGroupsLists(queryClient);
      }
    });
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {groups.length} archived group{groups.length !== 1 ? "s" : ""}
      </button>

      {expanded && (
        <div className="mt-3 flex flex-col gap-2">
          {groups.map((group) => {
            const archivedAt = new Date(group.created_at).toLocaleDateString("en-PH", {
              year: "numeric",
              month: "short",
              day: "numeric",
            });
            return (
              <div
                key={group.id}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 opacity-70"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-600">{group.name}</p>
                  <p className="text-xs text-slate-400">Created {archivedAt} &middot; Archived</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={ArchiveRestore}
                  onClick={() => handleRestore(group)}
                  isLoading={isPending}
                >
                  Restore
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
