import { InsightsPageClient } from "@/components/groups/InsightsPageClient";

type Props = {
  params: Promise<{ groupId: string }>;
};

// Thin RSC: numeric insights render instantly from the cached summaries; the
// slow LLM summary loads client-side after paint instead of blocking the page.
export default async function GroupInsightsPage({ params }: Props): Promise<React.ReactElement> {
  const { groupId } = await params;
  return <InsightsPageClient groupId={groupId} />;
}
