import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { cachedAuth } from "@/lib/supabase/queries";
import { listExpenses, listExpenseSummaries } from "@/app/actions/expenses";
import { getMembersWithBalances, getCreditorProfiles } from "@/app/actions/balances";
import { getPaymentProfile } from "@/app/actions/payment-profiles";
import { getGroupActivity } from "@/app/actions/activity";
import { listExpenseCategories } from "@/app/actions/categories";
import { listPendingPayments } from "@/app/actions/friend-payments";
import { GroupDetailClient } from "@/components/groups/GroupDetailClient";

type Props = {
  params: Promise<{ groupId: string }>;
};

function buildPaymentProfileText(profile: {
  payer_display_name?: string | null;
  gcash_name?: string | null;
  gcash_number?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  notes?: string | null;
} | null): string {
  if (!profile) return "";
  const lines: string[] = [];
  if (profile.payer_display_name) lines.push(profile.payer_display_name);
  if (profile.gcash_number) {
    lines.push(
      `Pay via GCash: ${profile.gcash_number}${profile.gcash_name ? ` (${profile.gcash_name})` : ""}`,
    );
  }
  if (profile.bank_name && profile.bank_account_number) {
    lines.push(
      `Or bank: ${profile.bank_name} ${profile.bank_account_number}${profile.bank_account_name ? ` (${profile.bank_account_name})` : ""}`,
    );
  }
  if (profile.notes) lines.push(profile.notes);
  return lines.join("\n");
}

function seed<T>(data: T | null, updatedAt: number): { data: T; updatedAt: number } | undefined {
  return data === null ? undefined : { data, updatedAt };
}

export default async function GroupDetailPage({ params }: Props): Promise<React.ReactElement> {
  const { groupId } = await params;
  const user = await cachedAuth();
  const supabase = await createClient();

  const { data: group } = await supabase
    .schema("settleup")
    .from("groups")
    .select("id, name, share_token, owner_user_id, budget_cents")
    .eq("id", groupId)
    .single();

  if (!group) notFound();

  const [balancesResult, expensesResult, summariesResult, profileResult, activityResult, creditorProfilesResult, categoriesResult, pendingPaymentsResult] = await Promise.all([
    getMembersWithBalances(groupId),
    listExpenses(groupId),
    listExpenseSummaries(groupId),
    getPaymentProfile(),
    getGroupActivity(groupId),
    getCreditorProfiles(groupId),
    listExpenseCategories(groupId),
    listPendingPayments(groupId),
  ]);
  const fetchedAt = Date.now();

  const profile = profileResult.data ?? null;
  const paymentProfileText = buildPaymentProfileText(profile);
  const hasPaymentDetails = Boolean(
    profile?.gcash_number || profile?.gcash_qr_url || profile?.bank_account_number || profile?.bank_qr_url,
  );

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  return (
    <GroupDetailClient
      groupId={groupId}
      group={group}
      currentUserId={user.id}
      origin={origin}
      isDev={process.env.NODE_ENV === "development"}
      paymentProfileText={paymentProfileText}
      hasPaymentDetails={hasPaymentDetails}
      initialBalances={seed(balancesResult.data, fetchedAt)}
      initialExpensesPage={seed(expensesResult.data, fetchedAt)}
      initialSummaries={seed(summariesResult.data, fetchedAt)}
      initialActivity={seed(activityResult.data, fetchedAt)}
      initialCreditorProfiles={seed(creditorProfilesResult.data, fetchedAt)}
      initialCategories={seed(categoriesResult.data, fetchedAt)}
      initialPendingPayments={seed(pendingPaymentsResult.data, fetchedAt)}
    />
  );
}
