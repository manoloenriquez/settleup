import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { createAnonClient } from "@template/supabase";
import { GroupOverview } from "@/components/groups/GroupOverview";
import { checkPublicRateLimit, getClientIp } from "@/lib/public-rate-limit";
import { trackPublic } from "@/lib/analytics/server";
import type { GroupOverviewPayload } from "@template/shared";

type Props = {
  params: Promise<{ shareToken: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await params;

  return {
    title: "Talli group overview",
    robots: { index: false, follow: false, nocache: true },
    description: "View a private Talli group overview link.",
    openGraph: {
      title: "Talli group overview",
      description: "View a private Talli group overview link.",
      images: ["/og/talli-social.png"],
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

  if (error || !data || (data as GroupOverviewPayload).error) {
    trackPublic(null, {
      name: "public_link_opened",
      properties: { link_type: "group", status: "invalid" },
    });
    notFound();
  }

  const payload = data as GroupOverviewPayload;
  trackPublic(shareToken, {
    name: "public_link_opened",
    properties: { link_type: "group", status: "valid" },
  });

  return <GroupOverview payload={payload} shareToken={shareToken} />;
}
