"use client";

import Link from "next/link";
import { simplifyDebts, formatCents } from "@template/shared";
import type { MemberBalance, CreditorPaymentProfile } from "@template/shared";
import type { ExpenseCategory } from "@template/supabase";
import { computeInsights } from "@template/ai/insights";
import { Share2, Sparkles, ChevronRight } from "lucide-react";
import {
  useMembersWithBalances,
  useExpensesInfinite,
  useExpenseSummaries,
  useGroupActivity,
  useCreditorProfiles,
  useCategoriesQuery,
  usePendingPaymentsQuery,
  type Seed,
  type ExpensesPage,
} from "@/hooks/queries";
import type { ActivityItem } from "@/app/actions/activity";
import type { ExpenseSummary } from "@/app/actions/expenses";
import type { PendingPayment } from "@/app/actions/friend-payments";
import { PendingPayments } from "@/components/groups/PendingPayments";
import { GroupRealtimeRefresher } from "@/components/groups/GroupRealtimeRefresher";
import { BudgetProgress } from "@/components/groups/BudgetProgress";
import { BalanceSummary } from "@/components/groups/BalanceSummary";
import { DebtSummary } from "@/components/groups/DebtSummary";
import { ActivityTimeline } from "@/components/groups/ActivityTimeline";
import { AddMemberForm } from "@/components/groups/AddMemberForm";
import { ExpenseList } from "@/components/groups/ExpenseList";
import { GroupDetailTabs } from "@/components/groups/GroupDetailTabs";
import { GroupHeader } from "@/components/groups/GroupHeader";
import { GroupSetupChecklist, setupChecklistIcons } from "@/components/groups/GroupSetupChecklist";
import { MemberAvatarRow } from "@/components/groups/MemberAvatarRow";
import { GroupFab } from "@/components/groups/GroupFab";
import { InsightsDashboard } from "@/components/groups/InsightsDashboard";
import { CategoryDonut } from "@/components/groups/charts/CategoryDonut";
import { SpendOverTime } from "@/components/groups/charts/SpendOverTime";
import { MemberPaidVsShare } from "@/components/groups/charts/MemberPaidVsShare";
import { SeedButton } from "@/components/groups/SeedButton";
import { CopyButton } from "@/components/groups/CopyButton";

const EXPENSES_PAGE_SIZE = 50;

type Props = {
  groupId: string;
  group: {
    id: string;
    name: string;
    share_token: string;
    owner_user_id: string | null;
    budget_cents: number | null;
  };
  currentUserId: string;
  origin: string;
  isDev: boolean;
  paymentProfileText: string;
  hasPaymentDetails: boolean;
  initialBalances: Seed<MemberBalance[]> | undefined;
  initialExpensesPage: Seed<ExpensesPage> | undefined;
  initialSummaries: Seed<ExpenseSummary[]> | undefined;
  initialActivity: Seed<ActivityItem[]> | undefined;
  initialCreditorProfiles: Seed<CreditorPaymentProfile[]> | undefined;
  initialCategories: Seed<ExpenseCategory[]> | undefined;
  initialPendingPayments: Seed<PendingPayment[]> | undefined;
};

export function GroupDetailClient({
  groupId,
  group,
  currentUserId,
  origin,
  isDev,
  paymentProfileText,
  hasPaymentDetails,
  initialBalances,
  initialExpensesPage,
  initialSummaries,
  initialActivity,
  initialCreditorProfiles,
  initialCategories,
  initialPendingPayments,
}: Props): React.ReactElement {
  const balancesQ = useMembersWithBalances(groupId, initialBalances);
  const expensesQ = useExpensesInfinite(groupId, EXPENSES_PAGE_SIZE, initialExpensesPage);
  const summariesQ = useExpenseSummaries(groupId, initialSummaries);
  const activityQ = useGroupActivity(groupId, initialActivity);
  const creditorProfilesQ = useCreditorProfiles(groupId, initialCreditorProfiles);
  const categoriesQ = useCategoriesQuery(groupId, initialCategories);
  const pendingPaymentsQ = usePendingPaymentsQuery(groupId, initialPendingPayments);

  const balances = balancesQ.data ?? [];
  const creditorProfiles = creditorProfilesQ.data ?? [];
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
  const expensePages = expensesQ.data?.pages ?? [];
  const summaries = summariesQ.data ?? [];
  const totalExpenseCount = expensePages[expensePages.length - 1]?.count ?? summaries.length;
  const activities = activityQ.data ?? [];
  const categories = categoriesQ.data ?? [];
  const isOwner = group.owner_user_id === currentUserId;
  const currentMember = members.find((m) => m.user_id === currentUserId);
  const isAdminOrOwner = isOwner || currentMember?.role === "admin";
  const debts = simplifyDebts(balances);
  // Group-wide aggregates come from the lightweight summaries (all rows), not
  // the paginated expense list.
  const totalSpentCents = summaries.reduce((sum, e) => sum + Math.max(0, e.amount_cents), 0);
  const totalOutstandingCents = balances.reduce((sum, b) => sum + b.owed_cents, 0);
  const myNetCents = currentMember
    ? balances.find((b) => b.member_id === currentMember.id)?.net_cents ?? 0
    : 0;
  const settledPct =
    totalSpentCents > 0
      ? Math.round((1 - totalOutstandingCents / totalSpentCents) * 100)
      : 100;

  // Charts tab data — pure computation from the all-rows summaries; the AI
  // summary stays on the dedicated insights page.
  const memberNameMap = new Map(members.map((m) => [m.id, m.display_name]));
  const insights = computeInsights(
    summaries.map((e) => ({
      item_name: e.item_name,
      amount_cents: e.amount_cents,
      created_at: e.created_at,
      expense_date: e.expense_date,
      payer_names: (e.payers ?? []).map((p) => memberNameMap.get(p.member_id) ?? "Unknown"),
      category: e.category,
    })),
  );

  const isFullySettled = totalOutstandingCents === 0;
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
      complete: totalExpenseCount > 0,
      href: `/groups/${groupId}`,
      icon: setupChecklistIcons.expense,
    },
  ];

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <GroupRealtimeRefresher groupId={groupId} />
      {/* Group header with breadcrumb + CTAs */}
      <GroupHeader
        groupId={groupId}
        groupName={group.name}
        memberCount={members.length}
        members={members}
        categories={categories}
        currentUserId={currentUserId}
      />

      <GroupSetupChecklist groupId={groupId} items={setupItems} />

      {/* Member avatars */}
      <MemberAvatarRow groupId={groupId} members={members} currentUserId={currentUserId} />

      {/* Group balance card */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-500">Group balance</p>
            <p className={`mt-1 text-3xl font-extrabold tracking-tight tabular-nums ${isFullySettled ? "text-emerald-600" : "text-slate-900"}`}>
              {isFullySettled ? "All settled" : formatCents(totalOutstandingCents)}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {myNetCents > 0 ? (
                <>You are owed <span className="font-bold text-emerald-600">{formatCents(myNetCents)}</span></>
              ) : myNetCents < 0 ? (
                <>You owe <span className="font-bold text-rose-600">{formatCents(-myNetCents)}</span></>
              ) : (
                "You’re settled up"
              )}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {totalExpenseCount} expense{totalExpenseCount !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-300"
            style={{ width: `${Math.max(0, Math.min(100, settledPct))}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-slate-400">{Math.max(0, Math.min(100, settledPct))}% settled</p>
      </div>

      {/* Budget progress */}
      {group.budget_cents !== null && group.budget_cents > 0 && (
        <BudgetProgress budgetCents={group.budget_cents} spentCents={totalSpentCents} />
      )}

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

      {/* Tabbed content: Expenses | Balances | Charts */}
      <GroupDetailTabs
        expensesContent={
          <ExpenseList
            members={members}
            categories={categories}
            currentUserId={currentUserId}
            isAdminOrOwner={isAdminOrOwner}
            groupId={groupId}
            pageSize={EXPENSES_PAGE_SIZE}
            initialPage={initialExpensesPage}
          />
        }
        balancesContent={
          <div className="flex flex-col gap-6">
            <PendingPayments
              groupId={groupId}
              pending={pendingPaymentsQ.data ?? []}
              members={members}
              currentUserId={currentUserId}
              isAdminOrOwner={isAdminOrOwner}
            />
            <DebtSummary
              debts={debts}
              groupId={groupId}
              groupName={group.name}
              balances={balances}
              origin={origin}
              currentMemberId={currentMember?.id ?? null}
            />
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
        chartsContent={
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <CategoryDonut categories={insights.categories} totalAmountCents={insights.total_amount_cents} />
              <SpendOverTime
                points={summaries.map((e) => ({
                  date: e.expense_date ?? e.created_at.slice(0, 10),
                  amount_cents: e.amount_cents,
                }))}
              />
            </div>
            <MemberPaidVsShare
              members={members.map((m) => ({ id: m.id, display_name: m.display_name }))}
              expenses={summaries.map((e) => ({ payers: e.payers, participants: e.participants }))}
            />
            <InsightsDashboard insights={{ ...insights, llm_summary: null }} />
            <Link
              href={`/groups/${groupId}/insights`}
              className="flex items-center justify-between rounded-2xl border border-brand-100 bg-brand-50/60 px-4 py-3 transition-colors hover:bg-brand-50"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-brand-700">
                <Sparkles size={15} />
                Full insights with AI summary
              </span>
              <ChevronRight size={16} className="text-brand-400" />
            </Link>
          </div>
        }
      />

      <GroupFab groupId={groupId} />
    </div>
  );
}
