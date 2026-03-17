import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { createAnonClient } from "@template/supabase";
import { FriendView } from "@/components/friend/FriendView";
import type { FriendViewPayload } from "@template/shared";

type Props = {
  params: Promise<{ share_token: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { share_token } = await params;

  const supabase = createAnonClient();
  const { data } = await supabase.schema("settleup").rpc("get_friend_view", {
    p_share_token: share_token,
  });

  const payload = data as FriendViewPayload | null;
  if (!payload || payload.error) {
    return { title: "Not found" };
  }

  const name = payload.member?.display_name ?? "Member";
  const group = payload.group?.name ?? "group";

  return {
    title: `${name}'s balance — ${group}`,
    description: `View ${name}'s payment details and balance in ${group}.`,
    openGraph: {
      title: `${name}'s balance — ${group}`,
      description: `View ${name}'s payment details and balance in ${group}.`,
    },
  };
}

export default async function FriendPage({ params }: Props): Promise<React.ReactElement> {
  const { share_token } = await params;

  const supabase = createAnonClient();
  const { data, error } = await supabase.schema("settleup").rpc("get_friend_view", {
    p_share_token: share_token,
  });

  if (error || !data) notFound();

  const payload = data as FriendViewPayload;
  if (payload.error) notFound();

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;
  const shareLink = `${origin}/p/${share_token}`;

  return <FriendView payload={payload} shareLink={shareLink} />;
}
