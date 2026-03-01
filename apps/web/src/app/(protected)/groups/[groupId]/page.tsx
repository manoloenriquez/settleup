import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { listExpenses } from "@/app/actions/expenses";
import { getMembersWithBalances } from "@/app/actions/balances";
import { getPaymentProfile } from "@/app/actions/payment-profiles";
import { getGroupActivity } from "@/app/actions/activity";
import { simplifyDebts } from "@template/shared";
import { BalanceSummary } from "@/components/groups/BalanceSummary";
import { DebtSummary } from "@/components/groups/DebtSummary";
import { ActivityTimeline } from "@/components/groups/ActivityTimeline";
import { AddMemberForm } from "@/components/groups/AddMemberForm";
import { ExpenseList } from "@/components/groups/ExpenseList";
import { GroupDetailTabs } from "@/components/groups/GroupDetailTabs";
import { GroupHeader } from "@/components/groups/GroupHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { SeedButton } from "@/components/groups/SeedButton";
import { CopyButton } from "@/components/groups/CopyButton";
import { Share2 } from "lucide-react";

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

export default async function GroupDetailPage({ params }: Props): Promise<React.ReactElement> {
  const { groupId } = await params;
  const supabase = await createClient();

  const { data: group } = await supabase
    .schema("settleup")
    .from("groups")
    .select("id, name, share_token")
    .eq("id", groupId)
    .single();

  if (!group) notFound();

  const [balancesResult, expensesResult, profileResult, activityResult] = await Promise.all([
    getMembersWithBalances(groupId),
    listExpenses(groupId),
    getPaymentProfile(),
    getGroupActivity(groupId),
  ]);

  const balances = balancesResult.data ?? [];
  const members = balances.map((b) => ({
    id: b.member_id,
    display_name: b.display_name,
    slug: b.slug,
    share_token: b.share_token,
    user_id: b.user_id,
    group_id: groupId,
    created_at: "",
  }));
  const expenses = expensesResult.data ?? [];
  const profile = profileResult.data ?? null;
  const activities = activityResult.data ?? [];
  const paymentProfileText = buildPaymentProfileText(profile);
  const debts = simplifyDebts(balances);

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;
  const isDev = process.env.NODE_ENV === "development";

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Group header with CTAs */}
      <GroupHeader
        groupId={groupId}
        groupName={group.name}
        memberCount={members.length}
        members={members}
      />

      {/* Share group overview */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2">
            <Share2 size={16} className="text-slate-400 shrink-0" />
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Group Overview Link
              </p>
              <p className="text-sm text-slate-700 truncate font-mono">
                {origin}/g/{group.share_token}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {isDev && <SeedButton />}
            <CopyButton text={`${origin}/g/${group.share_token}`} label="Copy Link" />
          </div>
        </CardContent>
      </Card>

      {/* Tabbed content (Balances + Expenses only) */}
      <GroupDetailTabs
        balancesContent={
          <div className="flex flex-col gap-6">
            <DebtSummary debts={debts} groupId={groupId} />
            <BalanceSummary
              members={members}
              balances={balances}
              groupId={groupId}
              groupName={group.name}
              paymentProfileText={paymentProfileText}
              origin={origin}
            />
            <div className="border-t border-slate-100 pt-4">
              <AddMemberForm groupId={groupId} />
            </div>
            <div className="border-t border-slate-100 pt-4">
              <ActivityTimeline activities={activities} />
            </div>
          </div>
        }
        expensesContent={
          <ExpenseList expenses={expenses} members={members} />
        }
      />
    </div>
  );
}
