"use client";

import Link from "next/link";
import {
  ROUTES,
  groupNetsByCurrency,
  nonZeroNets,
  owedTotalsByCurrency,
  type CurrencyAmount,
  type CurrencyCode,
} from "@template/shared";
import { useDashboardSummaries, useRecentActivity } from "@/hooks/queries";
import { SEPARATE_CURRENCIES_NOTE, currencyOrPhp, formatCurrency } from "@/lib/currency";
import { RecentActivityFeed } from "@/components/dashboard/RecentActivityFeed";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import {
  Users,
  Plus,
  History,
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

/** Net with a "+" when I am owed; formatCurrency already adds "-" when I owe. */
function signedNet(net: CurrencyAmount): string {
  const amount = formatCurrency(net.amountMinor, net.currency);
  return net.amountMinor > 0 ? `+${amount}` : amount;
}

export function DashboardClient({ profile }: Props): React.ReactElement {
  const summariesQ = useDashboardSummaries();
  const activityQ = useRecentActivity(5);

  const summaries = summariesQ.data;
  if (!summaries) {
    if (summariesQ.isError) {
      return (
        <div className="space-y-8 animate-fade-in">
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-red-600">{summariesQ.error.message}</p>
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
  // One entry per currency; amounts in different currencies are never added.
  const nets = nonZeroNets(summaries);
  const groupNets = groupNetsByCurrency(summaries);
  const owedRows = owedTotalsByCurrency(summaries);
  // All settled: keep the owed/owe cards, at zero, in the user's first currency.
  const fallbackCurrency: CurrencyCode = currencyOrPhp(summaries[0]?.currency_code);
  const owedCards =
    owedRows.length > 0
      ? owedRows
      : [{ currency: fallbackCurrency, owedToMe: 0, iOwe: 0, owedFrom: 0, oweTo: 0 }];
  // Every per-currency summary lists all of my groups; take names from the first.
  const groups = summaries[0]?.groups ?? [];
  const shownCurrencies = new Set<CurrencyCode>([
    ...nets.map((n) => n.currency),
    ...owedCards.map((row) => row.currency),
    ...[...groupNets.values()].flat().map((n) => n.currency),
  ]);
  const multiCurrency = shownCurrencies.size > 1;
  // The 30-day sparkline is in one currency; only draw it when exactly one
  // currency has spend, so series in different currencies are never mixed.
  const spendSeries = summaries.filter((s) => s.spend_series.some((p) => p.amount_cents > 0));
  const sparklinePoints = spendSeries.length === 1 ? (spendSeries[0]?.spend_series ?? []) : [];
  const owes = nets.some((n) => n.amountMinor < 0);
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
          <History size={16} />
        </Link>
      </div>

      {/* Total balance hero */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
              {nets.length > 1 ? "Balance by currency" : "Total balance"} <Info size={13} className="text-slate-300" />
            </p>
            {nets.length === 0 ? (
              <p className="mt-1 text-4xl font-extrabold tracking-tight tabular-nums text-slate-900 sm:text-5xl">
                All clear
              </p>
            ) : (
              nets.map((n) => (
                <p
                  key={n.currency}
                  className={`mt-1 font-extrabold tracking-tight tabular-nums ${
                    nets.length === 1 ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl"
                  } ${n.amountMinor > 0 ? "text-brand-700" : "text-rose-600"}`}
                >
                  {signedNet(n)}
                </p>
              ))
            )}
            <p className="mt-1.5 text-sm text-slate-500">
              {owes ? "Time to settle up" : "You’re in good shape! 🎉"}
            </p>
          </div>
          <Sparkline
            points={sparklinePoints}
            className={`mt-2 h-12 w-28 shrink-0 ${owes ? "text-rose-400" : "text-brand-500"}`}
          />
        </div>
      </div>

      {/* Owed / owe split, one row per currency */}
      <div className="space-y-3">
        {owedCards.map((row) => {
          // Green and red mean money is actually owed; an empty side stays neutral.
          const owedNone = row.owedToMe === 0;
          const oweNone = row.iOwe === 0;
          return (
            <div key={row.currency} className="grid grid-cols-2 gap-3">
              <div
                className={
                  owedNone
                    ? "rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    : "rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4"
                }
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-white ${owedNone ? "bg-slate-400" : "bg-emerald-600"}`}
                >
                  <ArrowDownLeft size={15} />
                </span>
                <p className={`mt-3 text-xs font-medium ${owedNone ? "text-slate-600" : "text-emerald-800"}`}>
                  You are <span className="font-bold">owed</span>
                </p>
                <p
                  className={`mt-0.5 truncate text-xl font-extrabold tabular-nums ${owedNone ? "text-slate-600" : "text-emerald-900"}`}
                >
                  {owedNone ? "Nothing" : formatCurrency(row.owedToMe, row.currency)}
                </p>
                <p className={`mt-0.5 text-xs ${owedNone ? "text-slate-500" : "text-emerald-700/80"}`}>
                  {owedNone ? "Nobody owes you" : `from ${row.owedFrom} ${row.owedFrom === 1 ? "person" : "people"}`}
                </p>
              </div>
              <div
                className={
                  oweNone
                    ? "rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    : "rounded-2xl border border-rose-100 bg-rose-50/70 p-4"
                }
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-white ${oweNone ? "bg-slate-400" : "bg-rose-500"}`}
                >
                  <ArrowUpRight size={15} />
                </span>
                <p className={`mt-3 text-xs font-medium ${oweNone ? "text-slate-600" : "text-rose-800"}`}>
                  You <span className="font-bold">owe</span>
                </p>
                <p
                  className={`mt-0.5 truncate text-xl font-extrabold tabular-nums ${oweNone ? "text-slate-600" : "text-rose-900"}`}
                >
                  {oweNone ? "Nothing" : formatCurrency(row.iOwe, row.currency)}
                </p>
                <p className={`mt-0.5 text-xs ${oweNone ? "text-slate-500" : "text-rose-700/80"}`}>
                  {oweNone ? "You’re all paid up" : `to ${row.oweTo} ${row.oweTo === 1 ? "person" : "people"}`}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {multiCurrency && <p className="px-0.5 text-xs text-slate-500">{SEPARATE_CURRENCIES_NOTE}</p>}

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
      {groups.length === 0 ? (
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
            {groups.slice(0, 9).map((group) => {
              const balances = groupNets.get(group.id) ?? [];
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
                      {balances.length === 0 ? (
                        <p className="mt-1 text-xs font-semibold text-slate-400">Settled up</p>
                      ) : (
                        balances.map((balance) =>
                          balance.amountMinor > 0 ? (
                            <p key={balance.currency} className="mt-1 text-xs text-slate-500">
                              You’re owed{" "}
                              <span className="font-bold text-emerald-600 tabular-nums">
                                {formatCurrency(balance.amountMinor, balance.currency)}
                              </span>
                            </p>
                          ) : (
                            <p key={balance.currency} className="mt-1 text-xs text-slate-500">
                              You owe{" "}
                              <span className="font-bold text-rose-600 tabular-nums">
                                {formatCurrency(-balance.amountMinor, balance.currency)}
                              </span>
                            </p>
                          ),
                        )
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
