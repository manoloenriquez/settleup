import Link from "next/link";
import { listGroups } from "@/app/actions/groups";
import { GroupCard } from "@/components/groups/GroupCard";
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@template/shared";

export default async function GroupsPage(): Promise<React.ReactElement> {
  const result = await listGroups();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Your Groups</h1>
        <Link href={ROUTES.GROUP_NEW}>
          <Button>New Group</Button>
        </Link>
      </div>

      {result.error && (
        <p className="text-sm text-red-600">{result.error}</p>
      )}

      {result.data && result.data.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <p className="text-slate-500">No groups yet. Create your first group.</p>
          <Link href={ROUTES.GROUP_NEW}>
            <Button>Create Group</Button>
          </Link>
        </div>
      )}

      {result.data && result.data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {result.data.map((group) => (
            <GroupCard key={group.id} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
