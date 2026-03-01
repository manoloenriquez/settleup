import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ROUTES } from "@template/shared";
import { formatCents } from "@template/shared";
import { cachedProfile } from "@/lib/supabase/queries";
import { getDashboardSummary } from "@/app/actions/dashboard";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Users,
  Plus,
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle,
  Camera,
} from "lucide-react";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage(): Promise<React.ReactElement> {
  const profile = await cachedProfile();
  if (!profile) redirect(ROUTES.LOGIN);

  const result = await getDashboardSummary();
  const summary = result.data;

  if (!summary) {
    return (
      <div className="space-y-8 animate-fade-in">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-red-600">{result.error}</p>
      </div>
    );
  }

  const isOwed = summary.net_balance_cents > 0;
  const owes = summary.net_balance_cents < 0;
  const settled = summary.net_balance_cents === 0;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Hero card */}
      <Card
        className={`overflow-hidden ${
          owes
            ? "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200"
            : isOwed
              ? "bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200"
              : "bg-gradient-to-br from-slate-50 to-indigo-50 border-indigo-200"
        }`}
      >
        <CardContent className="py-8">
          <p className="text-sm font-medium text-slate-500">
            Welcome back{profile.full_name ? `, ${profile.full_name}` : ""}
          </p>
          <div className="flex items-center gap-3 mt-2">
            {owes && <ArrowUpRight size={28} className="text-amber-500" />}
            {isOwed && <ArrowDownLeft size={28} className="text-emerald-500" />}
            {settled && <CheckCircle size={28} className="text-indigo-500" />}
            <div>
              <p className="text-3xl font-bold text-slate-900">
                {settled
                  ? "All settled!"
                  : formatCents(Math.abs(summary.net_balance_cents))}
              </p>
              {!settled && (
                <p className={`text-sm font-medium ${owes ? "text-amber-600" : "text-emerald-600"}`}>
                  {owes ? "You owe across all groups" : "Owed to you across all groups"}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 mt-4 text-xs text-slate-500">
            <span>{summary.total_groups} group{summary.total_groups !== 1 ? "s" : ""}</span>
            {summary.total_unsettled_cents > 0 && (
              <span>{formatCents(summary.total_unsettled_cents)} total unsettled</span>
            )}
            {summary.pending_members > 0 && (
              <span>{summary.pending_members} pending member{summary.pending_members !== 1 ? "s" : ""}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Link href={ROUTES.GROUP_NEW}>
          <Card className="hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer h-full">
            <CardContent className="flex flex-col items-center justify-center py-5 gap-2">
              <div className="rounded-full bg-indigo-100 p-2.5">
                <Plus size={20} className="text-indigo-600" />
              </div>
              <span className="text-sm font-medium text-slate-700">Create Group</span>
            </CardContent>
          </Card>
        </Link>
        <Link href={ROUTES.PAYMENT_SETTINGS}>
          <Card className="hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer h-full">
            <CardContent className="flex flex-col items-center justify-center py-5 gap-2">
              <div className="rounded-full bg-emerald-100 p-2.5">
                <CreditCard size={20} className="text-emerald-600" />
              </div>
              <span className="text-sm font-medium text-slate-700">Payment Settings</span>
            </CardContent>
          </Card>
        </Link>
        <Link href={ROUTES.GROUPS}>
          <Card className="hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer h-full">
            <CardContent className="flex flex-col items-center justify-center py-5 gap-2">
              <div className="rounded-full bg-amber-100 p-2.5">
                <Camera size={20} className="text-amber-600" />
              </div>
              <span className="text-sm font-medium text-slate-700">Scan Receipt</span>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Groups grid */}
      {summary.groups.length === 0 ? (
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
            {summary.groups.slice(0, 6).map((group) => (
              <Link key={group.id} href={`/groups/${group.id}`}>
                <Card className="hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer h-full">
                  <CardContent>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-slate-900 truncate">{group.name}</h3>
                      {group.pending_count > 0 ? (
                        <Badge variant="warning">{group.pending_count} pending</Badge>
                      ) : group.member_count > 0 ? (
                        <Badge variant="success">Settled</Badge>
                      ) : (
                        <Badge variant="neutral">Empty</Badge>
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex -space-x-1.5">
                        {Array.from({ length: Math.min(group.member_count, 4) }).map((_, i) => (
                          <div
                            key={i}
                            className="h-6 w-6 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center"
                          >
                            <span className="text-[10px] font-medium text-slate-500">
                              {i + 1}
                            </span>
                          </div>
                        ))}
                        {group.member_count > 4 && (
                          <div className="h-6 w-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center">
                            <span className="text-[10px] font-medium text-slate-400">
                              +{group.member_count - 4}
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">
                        {group.member_count} member{group.member_count !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {group.total_owed_cents > 0 && (
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-amber-600 font-medium">
                          {formatCents(group.total_owed_cents)} unsettled
                        </span>
                        <ArrowUpRight size={14} className="text-slate-400" />
                      </div>
                    )}
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
