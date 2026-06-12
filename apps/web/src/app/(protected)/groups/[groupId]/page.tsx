import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { cachedAuth } from "@/lib/supabase/queries";
import { listExpenses } from "@/app/actions/expenses";
import { getMembersWithBalances, getCreditorProfiles } from "@/app/actions/balances";
import { getPaymentProfile } from "@/app/actions/payment-profiles";
import { getGroupActivity } from "@/app/actions/activity";
import { listExpenseCategories } from "@/app/actions/categories";
import { listPendingPayments } from "@/app/actions/friend-payments";
import { PendingPayments } from "@/components/groups/PendingPayments";
import { simplifyDebts, formatCents } from "@template/shared";
import { BalanceSummary } from "@/components/groups/BalanceSummary";
import { DebtSummary } from "@/components/groups/DebtSummary";
import { ActivityTimeline } from "@/components/groups/ActivityTimeline";
import { AddMemberForm } from "@/components/groups/AddMemberForm";
import { ExpenseList } from "@/components/groups/ExpenseList";
import { GroupDetailTabs } from "@/components/groups/GroupDetailTabs";
import { GroupHeader } from "@/components/groups/GroupHeader";
import { GroupSetupChecklist, setupChecklistIcons } from "@/components/groups/GroupSetupChecklist";
import { SeedButton } from "@/components/groups/SeedButton";
import { CopyButton } from "@/components/groups/CopyButton";
import { AlertCircle, Share2 } from "lucide-react";

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
  const user = await cachedAuth();
  const supabase = await createClient();

  const { data: group } = await supabase
    .schema("settleup")
    .from("groups")
    .select("id, name, share_token, owner_user_id")
    .eq("id", groupId)
    .single();

  if (!group) notFound();

  const [balancesResult, expensesResult, profileResult, activityResult, creditorProfilesResult, categoriesResult, pendingPaymentsResult] = await Promise.all([
    getMembersWithBalances(groupId),
    listExpenses(groupId),
    getPaymentProfile(),
    getGroupActivity(groupId),
    getCreditorProfiles(groupId),
    listExpenseCategories(groupId),
    listPendingPayments(groupId),
  ]);

  const balances = balancesResult.data ?? [];
  const creditorProfiles = creditorProfilesResult.data ?? [];
  const members = balances.map((b) => ({
    id: b.member_id,
    display_name: b.display_name,
    slug: b.slug,
    share_token: b.share_token,
    user_id: b.user_id,
    role: (b.role ?? "member") as "owner" | "admin" | "member",
    group_id: groupId,
    created_at: "",
  }));
  const expenses = expensesResult.data ?? [];
  const profile = profileResult.data ?? null;
  const activities = activityResult.data ?? [];
  const categories = categoriesResult.data ?? [];
  const paymentProfileText = buildPaymentProfileText(profile);
  const currentUserId = user.id;
  const isOwner = group.owner_user_id === currentUserId;
  const currentMember = members.find((m) => m.user_id === currentUserId);
  const isAdminOrOwner = isOwner || currentMember?.role === "admin";
  const debts = simplifyDebts(balances);
  const pendingMembers = balances.filter((b) => b.net_cents < 0).length;
  const totalOutstandingCents = balances.reduce((sum, b) => sum + b.owed_cents, 0);

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;
  const isDev = process.env.NODE_ENV === "development";

  const isFullySettled = totalOutstandingCents === 0;
  const hasPaymentDetails = Boolean(
    profile?.gcash_number || profile?.gcash_qr_url || profile?.bank_account_number || profile?.bank_qr_url,
  );
  const setupItems = [
    {
      label: "Add members",
      complete: members.length > 1,
      href: `/groups/${groupId}`,
      icon: setupChecklistIcons.members,
    },
    {
      label: "Claim your profile",
      complete: Boolean(currentMember),
      href: `/groups/${groupId}/settings`,
      icon: setupChecklistIcons.claim,
    },
    {
      label: "Add payment details",
      complete: hasPaymentDetails,
      href: "/account/payment",
      icon: setupChecklistIcons.payment,
    },
    {
      label: "Share group link",
      complete: members.length > 1,
      copyText: `${origin}/g/${group.share_token}`,
      copyLabel: "Share",
      icon: setupChecklistIcons.share,
    },
    {
      label: "Add first expense",
      complete: expenses.length > 0,
      href: `/groups/${groupId}`,
      icon: setupChecklistIcons.expense,
    },
  ];

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Group header with breadcrumb + CTAs */}
      <GroupHeader
        groupId={groupId}
        groupName={group.name}
        memberCount={members.length}
        members={members}
        categories={categories}
      />

      <GroupSetupChecklist groupId={groupId} items={setupItems} />

      {/* Stats hero */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={`rounded-2xl p-4 col-span-2 ${isFullySettled ? "bg-emerald-50 border border-emerald-200" : "bg-amber-50 border border-amber-200"}`}>
          <p className={`text-xs font-semibold uppercase tracking-wider ${isFullySettled ? "text-emerald-600" : "text-amber-600"}`}>
            Outstanding Balance
          </p>
          <p className={`mt-1 text-2xl font-extrabold tracking-tight ${isFullySettled ? "text-emerald-800" : "text-amber-900"}`}>
            {isFullySettled ? "All settled" : formatCents(totalOutstandingCents)}
          </p>
          {isFullySettled && (
            <p className="text-xs text-emerald-600 mt-0.5">No outstanding debts</p>
          )}
        </div>
        <div className="rounded-2xl p-4 bg-white border border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Members</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900 tracking-tight">{members.length}</p>
          <div className="flex -space-x-1.5 mt-1.5">
            {Array.from({ length: Math.min(members.length, 5) }).map((_, i) => (
              <div key={i} className={`h-5 w-5 rounded-full border-2 border-white ${["bg-brand-500", "bg-violet-500", "bg-pink-500", "bg-emerald-500", "bg-amber-500"][i % 5]}`} />
            ))}
          </div>
        </div>
        <div className="rounded-2xl p-4 bg-white border border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pending</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900 tracking-tight">{pendingMembers}</p>
          {pendingMembers > 0 && (
            <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-0.5">
              <AlertCircle size={10} />
              unsettled
            </p>
          )}
          {pendingMembers === 0 && (
            <p className="text-xs text-emerald-600 mt-0.5">all clear</p>
          )}
        </div>
      </div>

      {/* Share link — secondary, subtle */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Share2 size={14} className="text-slate-400 shrink-0" />
          <p className="text-xs text-slate-400 truncate font-mono">
            {origin}/g/{group.share_token}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {isDev && <SeedButton />}
          <CopyButton text={`${origin}/g/${group.share_token}`} label="Share" />
        </div>
      </div>

      {/* Tabbed content (Balances + Expenses only) */}
      <GroupDetailTabs
        balancesContent={
          <div className="flex flex-col gap-6">
            <PendingPayments
              pending={pendingPaymentsResult.data ?? []}
              members={members}
              currentUserId={currentUserId}
              isAdminOrOwner={isAdminOrOwner}
            />
            <DebtSummary debts={debts} groupId={groupId} groupName={group.name} balances={balances} origin={origin} />
            <BalanceSummary
              members={members}
              balances={balances}
              groupId={groupId}
              groupName={group.name}
              paymentProfileText={paymentProfileText}
              origin={origin}
              creditorProfiles={creditorProfiles}
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
          <ExpenseList expenses={expenses} members={members} categories={categories} currentUserId={currentUserId} isAdminOrOwner={isAdminOrOwner} />
        }
      />
    </div>
  );
}
