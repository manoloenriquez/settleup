import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAnonClient } from "@template/supabase";
import { GroupOverview } from "@/components/groups/GroupOverview";
import type { GroupOverviewPayload } from "@template/shared";

type Props = {
  params: Promise<{ shareToken: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shareToken } = await params;

  const supabase = createAnonClient();
  const { data } = await supabase.schema("settleup").rpc("get_group_overview", {
    p_share_token: shareToken,
  });

  const payload = data as GroupOverviewPayload | null;
  if (!payload || payload.error) {
    return { title: "Not found" };
  }

  const group = payload.group.name;
  const count = payload.members.length;

  return {
    title: `${group} — Group Overview`,
    description: `View the expense summary and balances for ${group} (${count} members).`,
    openGraph: {
      title: `${group} — Group Overview`,
      description: `View the expense summary and balances for ${group} (${count} members).`,
    },
  };
}

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
