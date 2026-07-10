"use client";

import { formatCents, buildSuggestedSettlements, computePairwiseDebts } from "@template/shared";
import { CopyButton } from "@/components/groups/CopyButton";
import { OverviewMemberBreakdown } from "@/components/groups/OverviewMemberBreakdown";
import { OverviewPairwiseDebts } from "@/components/groups/OverviewPairwiseDebts";
import { OverviewSettleUpCard } from "@/components/groups/OverviewSettleUpCard";
import { OverviewExpenseList } from "@/components/groups/OverviewExpenseList";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { CheckCircle2, ArrowRight } from "lucide-react";
import type { GroupOverviewPayload, SuggestedSettlement } from "@template/shared";

type Props = {
  payload: GroupOverviewPayload;
};

function computeSettlements(payload: GroupOverviewPayload): SuggestedSettlement[] {
  if (payload.creditor_profiles?.length) {
    return buildSuggestedSettlements(payload.members, payload.creditor_profiles);
  }
  return [];
}

function buildSummaryText(payload: GroupOverviewPayload): string {
  const lines: string[] = [`GROUP SUMMARY — ${payload.group.name}`, "", "WHO OWES:"];

  for (const m of payload.members) {
    const net = m.net_cents ?? 0;
    const owed = m.owed_cents ?? Math.max(0, -net);
    if (net === 0) {
      lines.push(`${m.display_name} — Settled`);
    } else if (net > 0) {
      lines.push(`${m.display_name} — is owed ${formatCents(net)}`);
    } else {
      lines.push(`${m.display_name} — owes ${formatCents(owed)}`);
    }
  }

  const totalOwed = payload.members.reduce((sum, m) => sum + (m.owed_cents ?? Math.max(0, -(m.net_cents ?? 0))), 0);
  lines.push("", `Total outstanding: ${formatCents(totalOwed)}`);

  // Direct pairwise debts (before netting)
  if (payload.expenses.every((e) => Array.isArray(e.payers))) {
    const pairwise = computePairwiseDebts(payload.expenses, payload.payments ?? []);
    if (pairwise.length > 0) {
      lines.push("", "WHO OWES WHOM (before netting):");
      for (const d of pairwise) {
        lines.push(`${d.from_display_name} owes ${d.to_display_name} ${formatCents(d.amount_cents)}`);
      }
    }
  }

  // Suggested settlements
  const settlements = computeSettlements(payload);
  if (settlements.length > 0) {
    lines.push("", "SUGGESTED SETTLEMENTS:");
    for (const s of settlements) {
      lines.push(`${s.from_display_name} pays ${formatCents(s.amount_cents)} to ${s.to_display_name}`);
      const pp = s.creditor_profile;
      if (pp?.gcash_number) lines.push(`  GCash: ${pp.gcash_number}`);
      if (pp?.bank_name && pp?.bank_account_number) lines.push(`  Bank: ${pp.bank_name} ${pp.bank_account_number}`);
    }
  } else {
    // Fallback to owner profile
    const pp = payload.payment_profile;
    if (pp) {
      if (pp.payer_display_name) lines.push("", `Pay to: ${pp.payer_display_name}`);
      if (pp.gcash_number) lines.push(`GCash: ${pp.gcash_number}`);
      if (pp.bank_name && pp.bank_account_number) lines.push(`Bank: ${pp.bank_name} ${pp.bank_account_number}`);
      if (pp.notes) lines.push(pp.notes);
    }
  }

  const payments = payload.payments ?? [];
  if (payments.length > 0) {
    lines.push("", "PAYMENTS RECORDED:");
    for (const p of payments) {
      lines.push(`${p.from_display_name} paid ${p.to_display_name} ${formatCents(p.amount_cents)}`);
    }
  }

  if (payload.expenses.length > 0) {
    lines.push("", "EXPENSES:");
    for (const exp of payload.expenses) {
      const parts = exp.participants.map((p) => `${p.display_name} (${formatCents(p.share_cents)})`).join(", ");
      lines.push(`• ${exp.item_name} — ${formatCents(exp.amount_cents)}`);
      if (exp.payers && exp.payers.length > 0) {
        lines.push(`  Paid by ${exp.payers.map((p) => `${p.display_name} (${formatCents(p.paid_cents)})`).join(", ")}`);
      }
      if (parts) lines.push(`  ${parts}`);
      if (exp.items && exp.items.length > 0) {
        for (const item of exp.items) {
          lines.push(`  - ${item.name}: ${formatCents(item.amount_cents)}`);
        }
      }
    }
  }

  return lines.join("\n");
}

function formatPaymentDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

export function GroupOverview({ payload }: Props): React.ReactElement {
  const settlements = computeSettlements(payload);
  const payments = payload.payments ?? [];
  const totalOwed = payload.members.reduce((sum, m) => sum + (m.owed_cents ?? Math.max(0, -(m.net_cents ?? 0))), 0);
  const summaryText = buildSummaryText(payload);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-lg flex flex-col gap-6 animate-fade-in">
        {/* Gradient hero */}
        <div className="bg-gradient-to-br from-brand-600 to-violet-600 rounded-2xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 bg-dot-grid" />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white/70">Group Summary</span>
              {totalOwed === 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20">
                  <CheckCircle2 size={13} className="text-white/80" />
                  All settled
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{payload.group.name}</h1>
            {totalOwed > 0 && (
              <p className="mt-1 text-sm text-white/70">{formatCents(totalOwed)} outstanding</p>
            )}
            <div className="mt-4">
              <CopyButton text={summaryText} label="Copy Summary" />
            </div>
          </div>
        </div>

        {/* Member balances with per-member "why" breakdown */}
        <OverviewMemberBreakdown members={payload.members} expenses={payload.expenses} payments={payments} />

        {/* Direct pairwise debts, before netting into the Settle Up plan */}
        <OverviewPairwiseDebts expenses={payload.expenses} payments={payments} />

        {/* How to settle up (or owner fallback payment info) */}
        <OverviewSettleUpCard
          groupName={payload.group.name}
          settlements={settlements}
          ownerProfile={payload.payment_profile}
        />

        {/* Recorded payments */}
        {payments.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Payments recorded</h2>
              <p className="mt-1 text-xs text-slate-400 normal-case">
                Already paid? These settlements are counted in the balances above.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {payments.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-sm rounded-xl bg-slate-50/70 border border-slate-100 px-3 py-2.5">
                  <Avatar name={p.from_display_name} size="sm" />
                  <span className="text-slate-700 min-w-0 truncate">{p.from_display_name}</span>
                  <ArrowRight size={13} className="text-slate-400 shrink-0" />
                  <Avatar name={p.to_display_name} size="sm" />
                  <span className="text-slate-700 min-w-0 truncate">{p.to_display_name}</span>
                  <span className="ml-auto text-right shrink-0">
                    <span className="block font-semibold text-slate-900">{formatCents(p.amount_cents)}</span>
                    <span className="block text-[11px] text-slate-400">{formatPaymentDate(p.created_at)}</span>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Expense breakdown */}
        <OverviewExpenseList expenses={payload.expenses} />

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-slate-400">
          <div className="w-5 h-5 rounded bg-brand-600 flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">S</span>
          </div>
          <span>Powered by SettleUp</span>
        </div>
      </div>
    </div>
  );
}
