"use client";

import Link from "next/link";
import { ROUTES } from "@template/shared";
import type { GroupWithStats } from "@template/shared";
import type { Group } from "@template/supabase";
import { useGroupsWithStats, useArchivedGroups, type Seed } from "@/hooks/queries";
import { GroupList } from "@/components/groups/GroupList";
import { ArchivedGroupsSection } from "@/components/groups/ArchivedGroupsSection";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Plus, Users } from "lucide-react";

type Props = {
  initialGroups: Seed<GroupWithStats[]> | undefined;
  initialArchived: Seed<Group[]> | undefined;
  initialError: string | null;
};

export function GroupsClient({ initialGroups, initialArchived, initialError }: Props): React.ReactElement {
  const groupsQ = useGroupsWithStats(initialGroups);
  const archivedQ = useArchivedGroups(initialArchived);

  const groups = groupsQ.data;
  const error = groupsQ.error?.message ?? (groups ? null : initialError);

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Your Groups</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage expenses across all your groups</p>
        </div>
        <Link href={ROUTES.GROUP_NEW}>
          <Button leftIcon={Plus}>New Group</Button>
        </Link>
      </div>

      {error && !groups && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {groups && groups.length === 0 && (
        <Card>
          <EmptyState
            icon={Users}
            title="No groups yet"
            description="Create your first group to start splitting expenses."
            action={
              <Link href={ROUTES.GROUP_NEW}>
                <Button leftIcon={Plus} size="sm">Create Group</Button>
              </Link>
            }
          />
        </Card>
      )}

      {groups && groups.length > 0 && (
        <GroupList groups={groups} />
      )}

      <ArchivedGroupsSection groups={archivedQ.data ?? []} />
    </div>
  );
}
