import { GroupsClient } from "@/components/groups/GroupsClient";

// Thin RSC: no data awaits — the groups list renders from the persisted
// query cache and revalidates in the background.
export default function GroupsPage(): React.ReactElement {
  return <GroupsClient />;
}
