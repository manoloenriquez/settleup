"use client";

import Link from "next/link";
import { ROUTES } from "@template/shared";
import { useGroupsWithStats, useArchivedGroups } from "@/hooks/queries";
import { GroupList } from "@/components/groups/GroupList";
import { ArchivedGroupsSection } from "@/components/groups/ArchivedGroupsSection";
import { usePendingGroups } from "@/hooks/useOutboxPending";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Plus, Users } from "lucide-react";

export function GroupsClient(): React.ReactElement {
  const groupsQ = useGroupsWithStats();
  const archivedQ = useArchivedGroups();
  const pendingGroups = usePendingGroups();

  const groups = groupsQ.data;
  const error = groupsQ.isError ? groupsQ.error.message : null;

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

      {/* Cold cache: neutral placeholders while the list loads */}
      {!groups && !error && (
        <div className="flex flex-col gap-2" aria-busy="true">
          <div className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
          <div className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
          <div className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
        </div>
      )}

      {/* Groups created offline, waiting to sync — not navigable yet */}
      {pendingGroups.length > 0 && (
        <div className="flex flex-col gap-2">
          {pendingGroups.map((pending) => (
            <div
              key={pending.id}
              className="flex items-center gap-3 rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 px-4 py-3.5"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-sm font-bold text-amber-700">
                {pending.name.trim()[0]?.toUpperCase() ?? "G"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-700">{pending.name}</p>
                <p className="text-xs text-amber-700">
                  {pending.status === "failed"
                    ? "Sync failed — see pending changes"
                    : "Will be created when you're back online"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {groups && groups.length === 0 && pendingGroups.length === 0 && (
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
