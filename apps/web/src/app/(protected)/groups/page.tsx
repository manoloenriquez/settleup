import { listGroupsWithStats, listArchivedGroups } from "@/app/actions/groups";
import { GroupsClient } from "@/components/groups/GroupsClient";

export default async function GroupsPage(): Promise<React.ReactElement> {
  const [result, archivedResult] = await Promise.all([
    listGroupsWithStats(),
    listArchivedGroups(),
  ]);
  const fetchedAt = Date.now();

  return (
    <GroupsClient
      initialGroups={result.data ? { data: result.data, updatedAt: fetchedAt } : undefined}
      initialArchived={archivedResult.data ? { data: archivedResult.data, updatedAt: fetchedAt } : undefined}
      initialError={result.error}
    />
  );
}
