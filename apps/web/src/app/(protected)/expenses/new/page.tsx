import { notFound } from "next/navigation";
import { Plus, ReceiptText, Users } from "lucide-react";
import { listGroupsWithStats } from "@/app/actions/groups";
import { listMembers } from "@/app/actions/members";
import { listExpenseCategories } from "@/app/actions/categories";
import { cachedAuth } from "@/lib/supabase/queries";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Card } from "@/components/ui/Card";
import { GlobalExpenseEntry } from "@/components/groups/GlobalExpenseEntry";
import { ROUTES } from "@template/shared";

type Props = { searchParams: Promise<{ groupId?: string }> };

export default async function NewExpensePage({ searchParams }: Props): Promise<React.ReactElement> {
  const { groupId } = await searchParams;
  const [groupsResult, user] = await Promise.all([listGroupsWithStats(), cachedAuth()]);
  const groups = groupsResult.data ?? [];

  if (groups.length === 0) {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-700"><Users aria-hidden="true" /></div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-ink">Create a group first</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">Expenses belong to a group so everyone can see the same clear balance.</p>
        <ButtonLink href={ROUTES.GROUP_NEW} leftIcon={Plus} className="mt-6">Create group</ButtonLink>
      </Card>
    );
  }

  if (!groupId) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-in">
        <div className="mb-6">
          <p className="text-sm font-semibold text-brand-700">Add an expense</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">Which group is this for?</h1>
          <p className="mt-2 text-sm text-muted">Choose a group, then add details manually or scan a receipt.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((group) => (
            <ButtonLink key={group.id} href={`${ROUTES.EXPENSE_NEW}?groupId=${group.id}`} variant="secondary" className="h-auto justify-start gap-3 p-5 text-left">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-brand-100 text-brand-700"><ReceiptText size={19} aria-hidden="true" /></span>
              <span><span className="block text-sm font-bold text-ink">{group.name}</span><span className="mt-0.5 block text-xs font-medium text-muted">{group.member_count} member{group.member_count === 1 ? "" : "s"}</span></span>
            </ButtonLink>
          ))}
        </div>
      </div>
    );
  }

  if (!groups.some((group) => group.id === groupId)) notFound();
  const [membersResult, categoriesResult] = await Promise.all([listMembers(groupId), listExpenseCategories(groupId)]);
  if (!membersResult.data || !categoriesResult.data) notFound();

  return (
    <div className="mx-auto max-w-2xl py-12 text-center text-muted">
      <p>Preparing expense entry…</p>
      <GlobalExpenseEntry groupId={groupId} members={membersResult.data} categories={categoriesResult.data} currentUserId={user.id} />
    </div>
  );
}
