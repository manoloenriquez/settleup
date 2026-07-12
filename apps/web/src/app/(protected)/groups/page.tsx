import { listGroupsWithStats, listArchivedGroups } from "@/app/actions/groups";
import { GroupList } from "@/components/groups/GroupList";
import { ArchivedGroupsSection } from "@/components/groups/ArchivedGroupsSection";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { ROUTES } from "@template/shared";
import { Plus, Users } from "lucide-react";

export default async function GroupsPage(): Promise<React.ReactElement> {
  const [result, archivedResult] = await Promise.all([
    listGroupsWithStats(),
    listArchivedGroups(),
  ]);

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Your Groups</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage expenses across all your groups</p>
        </div>
        <ButtonLink href={ROUTES.GROUP_NEW} leftIcon={Plus}>New Group</ButtonLink>
      </div>

      {result.error && (
        <p className="text-sm text-red-600">{result.error}</p>
      )}

      {result.data && result.data.length === 0 && (
        <Card>
          <EmptyState
            icon={Users}
            title="No groups yet"
            description="Create your first group to start splitting expenses."
            action={
              <ButtonLink href={ROUTES.GROUP_NEW} leftIcon={Plus} size="sm">Create Group</ButtonLink>
            }
          />
        </Card>
      )}

      {result.data && result.data.length > 0 && (
        <GroupList groups={result.data} />
      )}

      <ArchivedGroupsSection groups={archivedResult.data ?? []} />
    </div>
  );
}
