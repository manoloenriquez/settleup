import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { listExpenses } from "@/app/actions/expenses";
import { getMembersWithBalances } from "@/app/actions/balances";
import { getPaymentProfile } from "@/app/actions/payment-profiles";
import { BalanceSummary } from "@/components/groups/BalanceSummary";
import { AddMemberForm } from "@/components/groups/AddMemberForm";
import { AddExpenseForm } from "@/components/groups/AddExpenseForm";
import { ChatExpenseInput } from "@/components/groups/ChatExpenseInput";
import { ExpenseList } from "@/components/groups/ExpenseList";
import { Button } from "@/components/ui/Button";
import { SeedButton } from "@/components/groups/SeedButton";
import { CopyButton } from "@/components/groups/CopyButton";

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

  const [balancesResult, expensesResult, profileResult] = await Promise.all([
    getMembersWithBalances(groupId),
    listExpenses(groupId),
    getPaymentProfile(),
  ]);

  const balances = balancesResult.data ?? [];
  // Derive member list from balances so we don't need a separate listMembers call
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
  const paymentProfileText = buildPaymentProfileText(profile);

  // Derive origin for share links
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  const isDev = process.env.NODE_ENV === "development";

  return (
    <div className="flex flex-col gap-8">
      {/* Group header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/groups" className="text-sm text-slate-500 hover:text-slate-700">
            ← Groups
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">{group.name}</h1>
        </div>
        <div className="flex gap-2">
          {isDev && <SeedButton />}
          <Link href="/account/payment">
            <Button variant="secondary" size="sm">
              Payment Settings
            </Button>
          </Link>
        </div>
      </div>

      {/* Share group overview */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
            Group Overview Link
          </p>
          <p className="text-sm text-slate-700 truncate font-mono">
            {origin}/g/{group.share_token}
          </p>
        </div>
        <CopyButton text={`${origin}/g/${group.share_token}`} label="Copy Link" />
      </div>

      {/* Balances */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <BalanceSummary
          members={members}
          balances={balances}
          groupId={groupId}
          groupName={group.name}
          paymentProfileText={paymentProfileText}
          origin={origin}
        />
        <div className="mt-4 border-t border-slate-100 pt-4">
          <AddMemberForm groupId={groupId} />
        </div>
      </section>

      {/* Add expense */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-slate-700 mb-4">Add Expense</h3>
        <div className="flex flex-col gap-6">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
              Form
            </p>
            <AddExpenseForm groupId={groupId} members={members} />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
              Chat / Quick Input
            </p>
            <ChatExpenseInput groupId={groupId} members={members} />
          </div>
        </div>
      </section>

      {/* Expenses list */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-slate-700 mb-4">Expenses</h3>
        <ExpenseList expenses={expenses} members={members} />
      </section>
    </div>
  );
}
