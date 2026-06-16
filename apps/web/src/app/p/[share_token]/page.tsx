import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { createAnonClient } from "@template/supabase";
import { FriendView } from "@/components/friend/FriendView";
import { checkPublicRateLimit, getClientIp } from "@/lib/public-rate-limit";
import type { FriendViewPayload } from "@template/shared";

type Props = {
  params: Promise<{ share_token: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await params;

  return {
    title: "SettleUp balance",
    description: "View a private SettleUp balance link.",
    openGraph: {
      title: "SettleUp balance",
      description: "View a private SettleUp balance link.",
    },
  };
}

export default async function FriendPage({ params }: Props): Promise<React.ReactElement> {
  const { share_token } = await params;
  const headersList = await headers();
  const clientIp = getClientIp(headersList);
  const allowed = checkPublicRateLimit(`friend:${clientIp}:${share_token}`, {
    maxRequests: 30,
    windowMs: 5 * 60_000,
  });

  if (!allowed) notFound();

  const supabase = createAnonClient();
  const { data, error } = await supabase.schema("settleup").rpc("get_friend_view", {
    p_share_token: share_token,
  });

  if (error || !data) notFound();

  const payload = data as FriendViewPayload;
  if (payload.error) notFound();

  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;
  const shareLink = `${origin}/p/${share_token}`;

  return <FriendView payload={payload} shareLink={shareLink} shareToken={share_token} />;
}
