import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { createAnonClient } from "@template/supabase";
import { FriendView } from "@/components/friend/FriendView";
import { checkPublicRateLimit, getClientIp } from "@/lib/public-rate-limit";
import { trackPublic } from "@/lib/analytics/server";
import { z } from "zod";
import { formatCents } from "@template/shared";
import type { FriendViewPayload } from "@template/shared";

type Props = {
  params: Promise<{ share_token: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await params;

  return {
    title: "Talli balance",
    robots: { index: false, follow: false, nocache: true },
    description: "View a private Talli balance link.",
    openGraph: {
      title: "Talli balance",
      description: "View a private Talli balance link.",
      images: ["/og/talli-social.png"],
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

  if (error || !data || (data as FriendViewPayload).error) {
    trackPublic(null, {
      name: "public_link_opened",
      properties: { link_type: "member", status: "invalid" },
    });
    notFound();
  }

  const payload = data as FriendViewPayload;
  trackPublic(share_token, {
    name: "public_link_opened",
    properties: { link_type: "member", status: "valid" },
  });

  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;
  const shareLink = `${origin}/p/${share_token}`;

  const { data: reportData } = await supabase
    .schema("settleup")
    .rpc("get_friend_payment_reports", { p_share_token: share_token });
  const parsedReports = z
    .array(
      z.object({
        id: z.string(),
        to_member_id: z.string(),
        amount_cents: z.number(),
        status: z.enum(["PENDING", "PAID", "REJECTED"]),
        created_at: z.string(),
      }),
    )
    .safeParse(reportData);
  const reports = parsedReports.success ? parsedReports.data : [];
  return (
    <>
      {reports.length > 0 && (
        <section className="mx-auto max-w-2xl space-y-2 p-4" aria-label="Your payment reports">
          <h2 className="font-semibold">Your payment reports</h2>
          {reports.map((report) => (
            <p key={report.id} className="text-sm">
              {formatCents(report.amount_cents)} —{" "}
              {report.status === "PAID"
                ? "Confirmed"
                : report.status === "PENDING"
                  ? "Awaiting confirmation"
                  : "Rejected — check with the recipient"}
            </p>
          ))}
          <p className="text-xs text-slate-500">
            Do not report the same payment again while awaiting confirmation. Refresh to check for
            updates.
          </p>
        </section>
      )}
      <FriendView payload={payload} shareLink={shareLink} shareToken={share_token} />
    </>
  );
}
