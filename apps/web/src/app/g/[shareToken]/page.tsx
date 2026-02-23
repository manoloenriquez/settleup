import { notFound } from "next/navigation";
import { createAnonClient } from "@template/supabase";
import { GroupOverview } from "@/components/groups/GroupOverview";
import type { GroupOverviewPayload } from "@template/shared";

type Props = {
  params: Promise<{ shareToken: string }>;
};

export default async function GroupOverviewPage({ params }: Props): Promise<React.ReactElement> {
  const { shareToken } = await params;

  const supabase = createAnonClient();
  const { data, error } = await supabase.schema("settleup").rpc("get_group_overview", {
    p_share_token: shareToken,
  });

  if (error || !data) notFound();

  const payload = data as GroupOverviewPayload;
  if (payload.error) notFound();

  return <GroupOverview payload={payload} />;
}
