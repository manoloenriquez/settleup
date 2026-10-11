import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { createAnonClient } from "@template/supabase";
import { GroupOverview, type CurrencyOverview } from "@/components/groups/GroupOverview";
import { checkPublicRateLimit, getClientIp } from "@/lib/public-rate-limit";
import { trackPublic } from "@/lib/analytics/server";
import { parseCurrencyCodes } from "@/lib/currency";
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
  const overviews = await loadOverviews(supabase, shareToken);

  if (!overviews) {
    trackPublic(null, {
      name: "public_link_opened",
      properties: { link_type: "group", status: "invalid" },
    });
    notFound();
  }

  trackPublic(shareToken, {
    name: "public_link_opened",
    properties: { link_type: "group", status: "valid" },
  });

  return <GroupOverview overviews={overviews} shareToken={shareToken} />;
}

/**
 * The overview for every currency behind the link, default first. Null when
 * the link is unknown or revoked, or any currency fails to load.
 */
async function loadOverviews(
  supabase: ReturnType<typeof createAnonClient>,
  shareToken: string,
): Promise<CurrencyOverview[] | null> {
  const db = supabase.schema("settleup");
  const { data: codesData, error: codesError } = await db.rpc("get_share_currencies", {
    p_share_token: shareToken,
  });
  if (codesError) return null;
  // [] means the token is unknown or revoked.
  const currencies = parseCurrencyCodes(codesData, []);
  if (currencies.length === 0) return null;

  const results = await Promise.all(
    currencies.map(async (currency): Promise<CurrencyOverview | null> => {
      const { data, error } = await db.rpc("get_group_overview_v2", {
        p_share_token: shareToken,
        p_currency_code: currency,
      });
      if (error || !data || (data as GroupOverviewPayload).error) return null;
      return { currency, payload: { ...(data as GroupOverviewPayload), currency_code: currency } };
    }),
  );
  if (results.some((result) => result === null)) return null;
  return results.filter((result): result is CurrencyOverview => result !== null);
}
