import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ROUTES } from "@template/shared";
import { formatCents } from "@template/shared";
import { cachedProfile } from "@/lib/supabase/queries";
import { getDashboardSummary } from "@/app/actions/dashboard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import {
  Users,
  Plus,
  CreditCard,
  ArrowUpRight,
  TrendingDown,
  CheckCircle2,
  ChevronRight,
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

  // Hero gradient config
  const heroConfig = owes
    ? {
        gradient: "from-amber-500 to-orange-500",
        bg: "bg-gradient-to-br from-amber-500 to-orange-500",
        badge: "bg-white/20 text-white",
        label: "Total you owe",
        icon: <TrendingDown size={20} className="text-white/80" />,
        pill: "You owe",
      }
    : isOwed
      ? {
          gradient: "from-emerald-500 to-teal-500",
          bg: "bg-gradient-to-br from-emerald-500 to-teal-500",
          badge: "bg-white/20 text-white",
          label: "Total owed to you",
          icon: <ArrowUpRight size={20} className="text-white/80" />,
          pill: "You're owed",
        }
      : {
          gradient: "from-brand-600 to-violet-600",
          bg: "bg-gradient-to-br from-brand-600 to-violet-600",
          badge: "bg-white/20 text-white",
          label: "Net balance",
          icon: <CheckCircle2 size={20} className="text-white/80" />,
          pill: "All settled",
        };

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Hero */}
      <div className={`${heroConfig.bg} rounded-2xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden`}>
        {/* Background texture */}
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "radial-gradient(circle at 80% 20%, white 1px, transparent 1px), radial-gradient(circle at 20% 80%, white 1px, transparent 1px)", backgroundSize: "32px 32px" }}
        />
        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-white/80">
              Welcome back{profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
            </span>
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${heroConfig.badge}`}>
              {heroConfig.icon}
              {heroConfig.pill}
            </span>
          </div>

          <p className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            {settled ? "All clear" : formatCents(Math.abs(summary.net_balance_cents))}
          </p>
          <p className="mt-1.5 text-sm text-white/70">{heroConfig.label}</p>

          <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-white/70">
            <span className="flex items-center gap-1">
              <Users size={14} />
              {summary.total_groups} group{summary.total_groups !== 1 ? "s" : ""}
            </span>
            {summary.total_unsettled_cents > 0 && (
              <span>{formatCents(summary.total_unsettled_cents)} outstanding</span>
            )}
            {summary.pending_members > 0 && (
              <span>{summary.pending_members} pending</span>
            )}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            href: ROUTES.GROUP_NEW,
            icon: <Plus size={22} />,
            label: "New Group",
            color: "text-brand-600",
            bg: "bg-brand-50 group-hover:bg-brand-100",
            border: "hover:border-brand-200",
          },
          {
            href: ROUTES.PAYMENT_SETTINGS,
            icon: <CreditCard size={22} />,
            label: "Payment Info",
            color: "text-emerald-600",
            bg: "bg-emerald-50 group-hover:bg-emerald-100",
            border: "hover:border-emerald-200",
          },
          {
            href: ROUTES.GROUPS,
            icon: <Users size={22} />,
            label: "All Groups",
            color: "text-violet-600",
            bg: "bg-violet-50 group-hover:bg-violet-100",
            border: "hover:border-violet-200",
          },
        ].map((action) => (
          <Link key={action.href} href={action.href} className="group">
            <div className={`bg-white rounded-2xl border border-slate-200 ${action.border} p-4 flex flex-col items-center gap-2.5 transition-all hover:shadow-md`}>
              <div className={`${action.bg} ${action.color} p-3 rounded-xl transition-colors`}>
                {action.icon}
              </div>
              <span className="text-xs font-semibold text-slate-700 text-center leading-tight">{action.label}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Groups */}
      {summary.groups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8">
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
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3 px-0.5">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Your Groups</h2>
            <Link href={ROUTES.GROUPS} className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-0.5">
              View all <ChevronRight size={13} />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.groups.slice(0, 6).map((group) => {
              const hasDebt = group.total_owed_cents > 0;
              return (
                <Link key={group.id} href={`/groups/${group.id}`} className="group">
                  <div className="bg-white rounded-2xl border border-slate-200 hover:border-brand-200 hover:shadow-md transition-all p-5 h-full flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-slate-900 truncate leading-tight">{group.name}</h3>
                      {hasDebt ? (
                        <span className="shrink-0 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          {formatCents(group.total_owed_cents)}
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          Settled
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-auto">
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-1.5">
                          {Array.from({ length: Math.min(group.member_count, 4) }).map((_, i) => (
                            <div
                              key={i}
                              className="h-6 w-6 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold"
                              style={{ backgroundColor: ["#6366f1","#8b5cf6","#ec4899","#10b981"][i % 4], color: "white" }}
                            >
                              {i + 1}
                            </div>
                          ))}
                        </div>
                        <span className="text-xs text-slate-400">
                          {group.member_count} member{group.member_count !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <ChevronRight size={14} className="text-slate-300 group-hover:text-brand-400 transition-colors" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
