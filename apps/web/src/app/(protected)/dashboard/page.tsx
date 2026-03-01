import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ROUTES } from "@template/shared";
import { formatCents } from "@template/shared";
import { cachedProfile } from "@/lib/supabase/queries";
import { listGroupsWithStats } from "@/app/actions/groups";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Users, Plus, CreditCard, Wallet, PiggyBank } from "lucide-react";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage(): Promise<React.ReactElement> {
  const profile = await cachedProfile();
  if (!profile) redirect(ROUTES.LOGIN);

  const groupsResult = await listGroupsWithStats();
  const groups = groupsResult.data ?? [];

  const totalGroups = groups.length;
  const totalOwed = groups.reduce((sum, g) => sum + g.total_owed_cents, 0);
  const totalPending = groups.reduce((sum, g) => sum + g.pending_count, 0);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Welcome back{profile.full_name ? `, ${profile.full_name}` : ""}!
        </h1>
        <p className="mt-1 text-sm text-slate-500">Here&apos;s your expense overview.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-50 p-2.5">
              <Users size={20} className="text-indigo-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Groups</p>
              <p className="text-xl font-bold text-slate-900">{totalGroups}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-50 p-2.5">
              <Wallet size={20} className="text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Unsettled</p>
              <p className="text-xl font-bold text-slate-900">
                {totalOwed > 0 ? formatCents(totalOwed) : "All clear"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-50 p-2.5">
              <PiggyBank size={20} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Pending Members</p>
              <p className="text-xl font-bold text-slate-900">{totalPending}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Link href={ROUTES.GROUP_NEW}>
          <Button leftIcon={Plus} size="md">
            Create Group
          </Button>
        </Link>
        <Link href={ROUTES.PAYMENT_SETTINGS}>
          <Button variant="secondary" leftIcon={CreditCard} size="md">
            Payment Settings
          </Button>
        </Link>
      </div>

      {/* Groups preview */}
      {groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="No groups yet"
            description="Create your first group to start splitting expenses with friends."
            action={
              <Link href={ROUTES.GROUP_NEW}>
                <Button leftIcon={Plus} size="sm">Create Group</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
              Your Groups
            </h2>
            <Link href={ROUTES.GROUPS} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
              View all
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.slice(0, 6).map((group) => (
              <Link key={group.id} href={`/groups/${group.id}`}>
                <Card className="hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer">
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-slate-900 truncate">{group.name}</h3>
                      {group.pending_count > 0 ? (
                        <Badge variant="warning">{group.pending_count} pending</Badge>
                      ) : group.member_count > 0 ? (
                        <Badge variant="success">Settled</Badge>
                      ) : (
                        <Badge variant="neutral">Empty</Badge>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Users size={12} />
                        {group.member_count} members
                      </span>
                      {group.total_owed_cents > 0 && (
                        <span className="text-amber-600 font-medium">
                          {formatCents(group.total_owed_cents)} unsettled
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
