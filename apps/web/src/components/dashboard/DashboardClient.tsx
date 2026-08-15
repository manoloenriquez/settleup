"use client";

import Link from "next/link";
import { ROUTES, formatCents } from "@template/shared";
import { useDashboardSummary, useRecentActivity } from "@/hooks/queries";
import { RecentActivityFeed } from "@/components/dashboard/RecentActivityFeed";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import {
  Users,
  Plus,
  Bell,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Info,
} from "lucide-react";

/**
 * Real 30-day sparkline of the user's daily expense share (spend_series from
 * get_dashboard_summary v4). Renders nothing when there's no activity — the
 * hero never shows fake data.
 */
function Sparkline({
  points,
  className = "",
}: {
  points: { date: string; amount_cents: number }[];
  className?: string;
}): React.ReactElement | null {
  const max = Math.max(...points.map((p) => p.amount_cents), 0);
  if (points.length < 2 || max === 0) return null;

  const W = 96;
  const H = 40;
  const PAD = 4;
  const stepX = (W - PAD * 2) / (points.length - 1);
  const coords = points.map((p, i) => ({
    x: PAD + i * stepX,
    y: H - PAD - (p.amount_cents / max) * (H - PAD * 2),
  }));
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  const end = coords[coords.length - 1]!;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} fill="none" aria-hidden="true" className={className}>
      <path d={path} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={end.x} cy={end.y} r="3" fill="currentColor" />
    </svg>
  );
}

type Props = {
  profile: { email: string; full_name: string | null };
};

export function DashboardClient({ profile }: Props): React.ReactElement {
  const summaryQ = useDashboardSummary();
  const activityQ = useRecentActivity(5);

  const summary = summaryQ.data;
  if (!summary) {
    if (summaryQ.isError) {
      return (
        <div className="space-y-8 animate-fade-in">
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-red-600">{summaryQ.error.message}</p>
        </div>
      );
    }
    // Cold cache: neutral skeleton mirroring the hero + cards layout.
    return (
      <div className="space-y-6 animate-fade-in" aria-busy="true">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-slate-100 animate-pulse" />
          <div className="h-4 w-32 rounded bg-slate-100 animate-pulse" />
        </div>
        <div className="h-40 rounded-3xl bg-slate-100 animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-28 rounded-2xl bg-slate-100 animate-pulse" />
          <div className="h-28 rounded-2xl bg-slate-100 animate-pulse" />
        </div>
        <div className="h-48 rounded-3xl bg-slate-100 animate-pulse" />
      </div>
    );
  }

  const firstName = profile.full_name?.split(" ")[0];
  const net = summary.net_balance_cents;
  const isOwed = net > 0;
  const owes = net < 0;
  const activity = activityQ.data ?? [];

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={profile.full_name ?? profile.email} size="md" />
          <div>
            <p className="text-xs text-slate-500">Welcome back</p>
            <p className="text-sm font-bold text-slate-900">{firstName ?? profile.email}</p>
          </div>
        </div>
        <Link
          href={ROUTES.ACTIVITY}
          aria-label="Activity"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:text-slate-900 hover:border-slate-300"
        >
          <Bell size={16} />
        </Link>
      </div>

      {/* Total balance hero */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
              Total balance <Info size={13} className="text-slate-300" />
            </p>
            <p
              className={`mt-1 text-4xl font-extrabold tracking-tight tabular-nums sm:text-5xl ${
                isOwed ? "text-brand-700" : owes ? "text-rose-600" : "text-slate-900"
              }`}
            >
              {isOwed ? "+" : ""}
              {net === 0 ? "All clear" : formatCents(net)}
            </p>
            <p className="mt-1.5 text-sm text-slate-500">
              {owes ? "Time to settle up" : "You’re in good shape! 🎉"}
            </p>
          </div>
          <Sparkline
            points={summary.spend_series}
            className={`mt-2 h-12 w-28 shrink-0 ${owes ? "text-rose-400" : "text-brand-500"}`}
          />
        </div>
      </div>

      {/* Owed / owe split */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white">
            <ArrowDownLeft size={15} />
          </span>
          <p className="mt-3 text-xs font-medium text-emerald-800">
            You are <span className="font-bold">owed</span>
          </p>
          <p className="mt-0.5 truncate text-xl font-extrabold tabular-nums text-emerald-900">
            {formatCents(summary.owed_to_me_cents)}
          </p>
          <p className="mt-0.5 text-xs text-emerald-700/80">
            from {summary.owed_counterparty_count} {summary.owed_counterparty_count === 1 ? "person" : "people"}
          </p>
        </div>
        <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-500 text-white">
            <ArrowUpRight size={15} />
          </span>
          <p className="mt-3 text-xs font-medium text-rose-800">
            You <span className="font-bold">owe</span>
          </p>
          <p className="mt-0.5 truncate text-xl font-extrabold tabular-nums text-rose-900">
            {formatCents(summary.i_owe_cents)}
          </p>
          <p className="mt-0.5 text-xs text-rose-700/80">
            to {summary.owe_counterparty_count} {summary.owe_counterparty_count === 1 ? "person" : "people"}
          </p>
        </div>
      </div>

      {/* Recent activity */}
      <div>
        <div className="mb-2 flex items-center justify-between px-0.5">
          <h2 className="text-sm font-bold text-slate-900">Recent activity</h2>
          <Link
            href={ROUTES.ACTIVITY}
            className="flex items-center gap-0.5 text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            View all <ChevronRight size={13} />
          </Link>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white px-4 py-1 shadow-sm">
          <RecentActivityFeed items={activity} />
        </div>
      </div>

      {/* Your groups */}
      {summary.groups.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8">
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
          <div className="mb-2 flex items-center justify-between px-0.5">
            <h2 className="text-sm font-bold text-slate-900">Your groups</h2>
            <Link
              href={ROUTES.GROUP_NEW}
              className="flex items-center gap-0.5 text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              <Plus size={13} /> New
            </Link>
          </div>
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
            {summary.groups.slice(0, 9).map((group) => {
              const myNet = group.my_net_cents;
              return (
                <Link
                  key={group.id}
                  href={`/groups/${group.id}`}
                  className="group w-40 shrink-0 snap-start sm:w-auto"
                >
                  <div className="flex h-full flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 transition-all hover:border-brand-200 hover:shadow-md">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-sm font-bold text-brand-700">
                      {group.name.trim()[0]?.toUpperCase() ?? "G"}
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold leading-tight text-slate-900">
                        {group.name}
                      </h3>
                      {myNet > 0 ? (
                        <p className="mt-1 text-xs text-slate-500">
                          You’re owed{" "}
                          <span className="font-bold text-emerald-600 tabular-nums">
                            {formatCents(myNet)}
                          </span>
                        </p>
                      ) : myNet < 0 ? (
                        <p className="mt-1 text-xs text-slate-500">
                          You owe{" "}
                          <span className="font-bold text-rose-600 tabular-nums">
                            {formatCents(-myNet)}
                          </span>
                        </p>
                      ) : (
                        <p className="mt-1 text-xs font-semibold text-slate-400">Settled up</p>
                      )}
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
