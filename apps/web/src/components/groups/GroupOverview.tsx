"use client";

import { buildSuggestedSettlements, computePairwiseDebts, currencyName } from "@template/shared";
import { CopyButton } from "@/components/groups/CopyButton";
import { trackPublicEvent } from "@/app/actions/analytics";
import { OverviewMemberBreakdown } from "@/components/groups/OverviewMemberBreakdown";
import { OverviewPairwiseDebts } from "@/components/groups/OverviewPairwiseDebts";
import { OverviewSettleUpCard } from "@/components/groups/OverviewSettleUpCard";
import { OverviewExpenseList } from "@/components/groups/OverviewExpenseList";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { formatCurrency, SEPARATE_CURRENCIES_NOTE } from "@/lib/currency";
import type { CurrencyCode, GroupOverviewPayload, SuggestedSettlement } from "@template/shared";

type Props = {
  /** One entry per currency the group uses, default currency first. */
  overviews: CurrencyOverview[];
  shareToken: string;
};

/** A group's shared-page payload for one currency; every amount is in `currency`. */
export type CurrencyOverview = {
  currency: CurrencyCode;
  payload: GroupOverviewPayload;
};

function computeSettlements(payload: GroupOverviewPayload): SuggestedSettlement[] {
  if (payload.creditor_profiles?.length) {
    return buildSuggestedSettlements(payload.members, payload.creditor_profiles);
  }
  return [];
}

/** Total still owed within one currency (never summed across currencies). */
function totalOutstanding(payload: GroupOverviewPayload): number {
  return payload.members.reduce(
    (sum, m) => sum + (m.owed_cents ?? Math.max(0, -(m.net_cents ?? 0))),
    0,
  );
}

function summaryLinesFor({ currency, payload }: CurrencyOverview): string[] {
  const money = (minor: number): string => formatCurrency(minor, currency);
  const lines: string[] = [`AMOUNTS IN ${currency} (${currencyName(currency)})`, "", "WHO OWES:"];

  for (const m of payload.members) {
    const net = m.net_cents ?? 0;
    const owed = m.owed_cents ?? Math.max(0, -net);
    if (net === 0) {
      lines.push(`${m.display_name} — Settled`);
    } else if (net > 0) {
      lines.push(`${m.display_name} — is owed ${money(net)}`);
    } else {
      lines.push(`${m.display_name} — owes ${money(owed)}`);
    }
  }

  lines.push("", `Total outstanding: ${money(totalOutstanding(payload))}`);

  // Direct pairwise debts (before netting)
  if (payload.expenses.every((e) => Array.isArray(e.payers))) {
    const pairwise = computePairwiseDebts(payload.expenses, payload.payments ?? []);
    if (pairwise.length > 0) {
      lines.push("", "WHO OWES WHOM (before netting):");
      for (const d of pairwise) {
        lines.push(
          `${d.from_display_name} owes ${d.to_display_name} ${money(d.amount_cents)}`,
        );
      }
    }
  }

  // Suggested settlements
  const settlements = computeSettlements(payload);
  if (settlements.length > 0) {
    lines.push("", "SUGGESTED SETTLEMENTS:");
    for (const s of settlements) {
      lines.push(
        `${s.from_display_name} pays ${money(s.amount_cents)} to ${s.to_display_name}`,
      );
      const pp = s.creditor_profile;
      if (pp?.gcash_number) lines.push(`  GCash: ${pp.gcash_number}`);
      if (pp?.bank_name && pp?.bank_account_number)
        lines.push(`  Bank: ${pp.bank_name} ${pp.bank_account_number}`);
    }
  } else {
    // Fallback to owner profile
    const pp = payload.payment_profile;
    if (pp) {
      if (pp.payer_display_name) lines.push("", `Pay to: ${pp.payer_display_name}`);
      if (pp.gcash_number) lines.push(`GCash: ${pp.gcash_number}`);
      if (pp.bank_name && pp.bank_account_number)
        lines.push(`Bank: ${pp.bank_name} ${pp.bank_account_number}`);
      if (pp.notes) lines.push(pp.notes);
    }
  }

  const payments = payload.payments ?? [];
  if (payments.length > 0) {
    lines.push("", "PAYMENTS RECORDED:");
    for (const p of payments) {
      lines.push(`${p.from_display_name} paid ${p.to_display_name} ${money(p.amount_cents)}`);
    }
  }

  if (payload.expenses.length > 0) {
    lines.push("", "EXPENSES:");
    for (const exp of payload.expenses) {
      const parts = exp.participants
        .map((p) => `${p.display_name} (${money(p.share_cents)})`)
        .join(", ");
      lines.push(`• ${exp.item_name} — ${money(exp.amount_cents)}`);
      if (exp.payers && exp.payers.length > 0) {
        lines.push(
          `  Paid by ${exp.payers.map((p) => `${p.display_name} (${money(p.paid_cents)})`).join(", ")}`,
        );
      }
      if (parts) lines.push(`  ${parts}`);
      if (exp.items && exp.items.length > 0) {
        for (const item of exp.items) {
          lines.push(`  - ${item.name}: ${money(item.amount_cents)}`);
        }
      }
    }
  }

  return lines;
}

function buildSummaryText(groupName: string, overviews: CurrencyOverview[]): string {
  const lines: string[] = [`GROUP SUMMARY — ${groupName}`];
  if (overviews.length > 1) lines.push(SEPARATE_CURRENCIES_NOTE);
  for (const overview of overviews) {
    lines.push("", ...summaryLinesFor(overview));
  }
  return lines.join("\n");
}

function formatPaymentDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function CurrencySection({
  overview,
  groupName,
  shareToken,
}: {
  overview: CurrencyOverview;
  groupName: string;
  shareToken: string;
}): React.ReactElement {
  const { currency, payload } = overview;
  const settlements = computeSettlements(payload);
  const payments = payload.payments ?? [];
  const headingId = `amounts-${currency}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2
        id={headingId}
        className="flex items-center gap-2 text-sm font-bold text-slate-700 tracking-tight"
      >
        <span className="rounded-md bg-brand-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
          {currency}
        </span>
        Amounts in {currency} · {currencyName(currency)}
      </h2>

      {/* Member balances with per-member "why" breakdown */}
      <OverviewMemberBreakdown
        members={payload.members}
        expenses={payload.expenses}
        payments={payments}
        currency={currency}
      />

      {/* Direct pairwise debts, before netting into the Settle Up plan */}
      <OverviewPairwiseDebts expenses={payload.expenses} payments={payments} currency={currency} />

      {/* How to settle up (or owner fallback payment info) */}
      <OverviewSettleUpCard
        groupName={groupName}
        settlements={settlements}
        ownerProfile={payload.payment_profile}
        currency={currency}
        onAction={(action) => {
          void trackPublicEvent({
            share_token: shareToken,
            name: "payment_details_actioned",
            properties: { action },
          });
        }}
      />

      {/* Recorded payments */}
      {payments.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Payments recorded
            </h3>
            <p className="mt-1 text-xs text-slate-400 normal-case">
              Already paid? These settlements are counted in the balances above.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {payments.map((p, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-sm rounded-xl bg-slate-50/70 border border-slate-100 px-3 py-2.5"
              >
                <Avatar name={p.from_display_name} size="sm" />
                <span className="text-slate-700 min-w-0 truncate">{p.from_display_name}</span>
                <ArrowRight size={13} className="text-slate-400 shrink-0" />
                <Avatar name={p.to_display_name} size="sm" />
                <span className="text-slate-700 min-w-0 truncate">{p.to_display_name}</span>
                <span className="ml-auto text-right shrink-0">
                  <span className="block font-semibold text-slate-900">
                    {formatCurrency(p.amount_cents, currency)}
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    {formatPaymentDate(p.created_at)}
                  </span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Expense breakdown */}
      <OverviewExpenseList expenses={payload.expenses} currency={currency} />
    </section>
  );
}

export function GroupOverview({ overviews, shareToken }: Props): React.ReactElement {
  const groupName = overviews[0]?.payload.group.name ?? "";
  const outstanding = overviews
    .map(({ currency, payload }) => ({ currency, total: totalOutstanding(payload) }))
    .filter(({ total }) => total > 0);
  const summaryText = buildSummaryText(groupName, overviews);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-lg flex flex-col gap-6 animate-fade-in">
        {/* Gradient hero */}
        <div className="bg-gradient-to-br from-brand-600 to-violet-600 rounded-2xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 bg-dot-grid" />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white/70">Group Summary</span>
              {outstanding.length === 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20">
                  <CheckCircle2 size={13} className="text-white/80" />
                  All settled
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{groupName}</h1>
            {outstanding.map(({ currency, total }) => (
              <p key={currency} className="mt-1 text-sm text-white/70">
                {formatCurrency(total, currency)} outstanding
                {overviews.length > 1 ? ` in ${currency}` : ""}
              </p>
            ))}
            {overviews.length > 1 && (
              <p className="mt-2 text-xs text-white/60">{SEPARATE_CURRENCIES_NOTE}</p>
            )}
            <div className="mt-4">
              <CopyButton text={summaryText} label="Copy Summary" />
            </div>
          </div>
        </div>

        {overviews.map((overview) => (
          <CurrencySection
            key={overview.currency}
            overview={overview}
            groupName={groupName}
            shareToken={shareToken}
          />
        ))}

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-slate-400">
          <div className="w-5 h-5 rounded bg-brand-600 flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">T</span>
          </div>
          <span>Powered by Talli</span>
        </div>
      </div>
    </div>
  );
}
