import { GroupDetailClient } from "@/components/groups/GroupDetailClient";

type Props = {
  params: Promise<{ groupId: string }>;
};

// Deliberately thin: no data awaits. Auth is enforced by middleware +
// (protected)/layout.tsx; all data renders instantly from the persisted
// React Query cache and revalidates in the background. A bad/inaccessible
// id is handled client-side by GroupDetailClient's not-found card.
export default async function GroupDetailPage({ params }: Props): Promise<React.ReactElement> {
  const { groupId } = await params;
  return <GroupDetailClient groupId={groupId} isDev={process.env.NODE_ENV === "development"} />;
}
