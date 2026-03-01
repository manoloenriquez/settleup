import Link from "next/link";
import { listGroupsWithStats } from "@/app/actions/groups";
import { GroupListItem } from "@/components/groups/GroupListItem";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { ROUTES } from "@template/shared";
import { Plus, Users } from "lucide-react";

export default async function GroupsPage(): Promise<React.ReactElement> {
  const result = await listGroupsWithStats();

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Your Groups</h1>
        <Link href={ROUTES.GROUP_NEW}>
          <Button leftIcon={Plus}>New Group</Button>
        </Link>
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
              <Link href={ROUTES.GROUP_NEW}>
                <Button leftIcon={Plus} size="sm">Create Group</Button>
              </Link>
            }
          />
        </Card>
      )}

      {result.data && result.data.length > 0 && (
        <div className="flex flex-col gap-2">
          {result.data.map((group) => (
            <GroupListItem key={group.id} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
