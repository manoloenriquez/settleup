import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { createAnonClient } from "@template/supabase";
import { FriendView, type CurrencyFriendView } from "@/components/friend/FriendView";
import { checkPublicRateLimit, getClientIp } from "@/lib/public-rate-limit";
import { trackPublic } from "@/lib/analytics/server";
import { z } from "zod";
import { currencyCodeSchema } from "@template/shared";
import type { CurrencyCode, FriendViewPayload } from "@template/shared";
import { formatCurrency, parseCurrencyCodes } from "@/lib/currency";

type Props = {
  params: Promise<{ share_token: string }>;
};

type AnonClient = ReturnType<typeof createAnonClient>;

const reportsSchema = z.array(
  z.object({
    id: z.string(),
    to_member_id: z.string(),
    amount_cents: z.number().int(),
    currency_code: currencyCodeSchema,
    status: z.enum(["PENDING", "PAID", "REJECTED"]),
    created_at: z.string(),
  }),
);

type PaymentReport = z.infer<typeof reportsSchema>[number];

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
  const views = await loadFriendViews(supabase, share_token);

  if (!views) {
    trackPublic(null, {
      name: "public_link_opened",
      properties: { link_type: "member", status: "invalid" },
    });
    notFound();
  }

  trackPublic(share_token, {
    name: "public_link_opened",
    properties: { link_type: "member", status: "valid" },
  });

  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;
  const shareLink = `${origin}/p/${share_token}`;

  const reports = await loadPaymentReports(
    supabase,
    share_token,
    views.map((view) => view.currency),
  );
  return (
    <>
      {reports.length > 0 && (
        <section className="mx-auto max-w-2xl space-y-2 p-4" aria-label="Your payment reports">
          <h2 className="font-semibold">Your payment reports</h2>
          {reports.map((report) => (
            <p key={report.id} className="text-sm">
              {formatCurrency(report.amount_cents, report.currency_code)} —{" "}
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
      <FriendView views={views} shareLink={shareLink} shareToken={share_token} />
    </>
  );
}

/**
 * The member's view for every currency behind the link, default first. Null
 * when the link is unknown or revoked, or any currency fails to load.
 */
async function loadFriendViews(
  supabase: AnonClient,
  shareToken: string,
): Promise<CurrencyFriendView[] | null> {
  const db = supabase.schema("settleup");
  const { data: codesData, error: codesError } = await db.rpc("get_share_currencies", {
    p_share_token: shareToken,
  });
  if (codesError) return null;
  // [] means the token is unknown or revoked.
  const currencies = parseCurrencyCodes(codesData, []);
  if (currencies.length === 0) return null;

  const results = await Promise.all(
    currencies.map(async (currency): Promise<CurrencyFriendView | null> => {
      const { data, error } = await db.rpc("get_friend_view_v2", {
        p_share_token: shareToken,
        p_currency_code: currency,
      });
      if (error || !data || (data as FriendViewPayload).error) return null;
      return { currency, payload: { ...(data as FriendViewPayload), currency_code: currency } };
    }),
  );
  if (results.some((result) => result === null)) return null;
  return results.filter((result): result is CurrencyFriendView => result !== null);
}

/** Reports in every currency; a currency whose reports fail to load is skipped. */
async function loadPaymentReports(
  supabase: AnonClient,
  shareToken: string,
  currencies: CurrencyCode[],
): Promise<PaymentReport[]> {
  const db = supabase.schema("settleup");
  const perCurrency = await Promise.all(
    currencies.map(async (currency): Promise<PaymentReport[]> => {
      const { data, error } = await db.rpc("get_friend_payment_reports_v2", {
        p_share_token: shareToken,
        p_currency_code: currency,
      });
      if (error) return [];
      const parsed = reportsSchema.safeParse(data);
      return parsed.success ? parsed.data : [];
    }),
  );
  // One list per currency; dedupe by id in case a report is returned twice.
  const seen = new Set<string>();
  return perCurrency.flat().filter((report) => {
    if (seen.has(report.id)) return false;
    seen.add(report.id);
    return true;
  });
}
