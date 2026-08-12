import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { createAnonClient } from "@template/supabase";
import { GroupOverview } from "@/components/groups/GroupOverview";
import { checkPublicRateLimit, getClientIp } from "@/lib/public-rate-limit";
import type { GroupOverviewPayload } from "@template/shared";

type Props = {
  params: Promise<{ shareToken: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await params;

  return {
    title: "SettleUp group overview",
    description: "View a private SettleUp group overview link.",
    openGraph: {
      title: "SettleUp group overview",
      description: "View a private SettleUp group overview link.",
      images: ["/og/settleup-social.png"],
    },
  };
}

export default async function GroupOverviewPage({ params }: Props): Promise<React.ReactElement> {
  const { shareToken } = await params;
  const headersList = await headers();
  const clientIp = getClientIp(headersList);
  const allowed = checkPublicRateLimit(`group:${clientIp}:${shareToken}`, {
    maxRequests: 20,
    windowMs: 5 * 60_000,
  });

  if (!allowed) notFound();

  const supabase = createAnonClient();
  const { data, error } = await supabase.schema("settleup").rpc("get_group_overview", {
    p_share_token: shareToken,
  });

  if (error || !data) notFound();

  const payload = data as GroupOverviewPayload;
  if (payload.error) notFound();

  return <GroupOverview payload={payload} />;
}
