"use client";

import { formatCents } from "@template/shared";
import { CopyButton } from "@/components/groups/CopyButton";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Receipt, Users, Smartphone, Landmark } from "lucide-react";
import type { GroupOverviewPayload } from "@template/shared";

type Props = {
  payload: GroupOverviewPayload;
};

type MemberWithNet = GroupOverviewPayload["members"][number] & {
  _net: number;
  _owed: number;
};

function sortedMembers(members: GroupOverviewPayload["members"]): MemberWithNet[] {
  return members
    .map((m) => {
      const net = m.net_cents ?? 0;
      const owed = m.owed_cents ?? Math.max(0, -net);
      return { ...m, _net: net, _owed: owed };
    })
    .sort((a, b) => {
      // owes first (negative net, largest debt first)
      if (a._net < 0 && b._net >= 0) return -1;
      if (b._net < 0 && a._net >= 0) return 1;
      if (a._net < 0 && b._net < 0) return a._net - b._net; // more negative first
      // then owed (positive net, largest first)
      if (a._net > 0 && b._net === 0) return -1;
      if (b._net > 0 && a._net === 0) return 1;
      if (a._net > 0 && b._net > 0) return b._net - a._net;
      return 0;
    });
}

function buildSummaryText(payload: GroupOverviewPayload): string {
  const pp = payload.payment_profile;
  const lines: string[] = [`GROUP SUMMARY — ${payload.group.name}`, "", "WHO OWES:"];

  for (const m of payload.members) {
    const net = m.net_cents ?? 0;
    const owed = m.owed_cents ?? Math.max(0, -net);
    if (net === 0) {
      lines.push(`${m.display_name} — Settled ✓`);
    } else if (net > 0) {
      lines.push(`${m.display_name} — is owed ${formatCents(net)}`);
    } else {
      lines.push(`${m.display_name} — owes ${formatCents(owed)}`);
    }
  }

  const totalOwed = payload.members.reduce((sum, m) => sum + (m.owed_cents ?? Math.max(0, -(m.net_cents ?? 0))), 0);
  lines.push("", `Total outstanding: ${formatCents(totalOwed)}`);

  if (pp) {
    if (pp.payer_display_name) lines.push("", `Pay to: ${pp.payer_display_name}`);
    if (pp.gcash_number) lines.push(`GCash: ${pp.gcash_number}`);
    if (pp.bank_name && pp.bank_account_number) {
      lines.push(`Bank: ${pp.bank_name} ${pp.bank_account_number}`);
    }
    if (pp.notes) lines.push(pp.notes);
  }

  if (payload.expenses.length > 0) {
    lines.push("", "EXPENSES:");
    for (const exp of payload.expenses) {
      const parts = exp.participants.map((p) => `${p.display_name} (${formatCents(p.share_cents)})`).join(", ");
      lines.push(`• ${exp.item_name} — ${formatCents(exp.amount_cents)}`);
      if (parts) lines.push(`  ${parts}`);
    }
  }

  return lines.join("\n");
}

export function GroupOverview({ payload }: Props): React.ReactElement {
  const pp = payload.payment_profile;
  const totalOwed = payload.members.reduce((sum, m) => sum + (m.owed_cents ?? Math.max(0, -(m.net_cents ?? 0))), 0);
  const summaryText = buildSummaryText(payload);
  const sorted = sortedMembers(payload.members);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-lg flex flex-col gap-6 animate-fade-in">
        {/* Header */}
        <Card>
          <CardContent className="py-6">
            <h1 className="text-2xl font-bold text-slate-900">{payload.group.name}</h1>
            <p className="text-sm text-slate-500 mt-1">Expense Summary</p>
            <div className="mt-4 flex justify-end">
              <CopyButton text={summaryText} label="Copy Summary" />
            </div>
          </CardContent>
        </Card>

        {/* Member balances */}
        <Card>
          <CardHeader>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Who owes</h2>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {sorted.map((m) => (
                <div
                  key={m.member_id}
                  className={`flex items-center justify-between text-sm rounded-lg px-3 py-2 border-l-4 ${
                    m._net < 0
                      ? "border-l-amber-400 bg-amber-50/50"
                      : m._net > 0
                        ? "border-l-emerald-400 bg-emerald-50/50"
                        : "border-l-slate-200 bg-slate-50/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Avatar name={m.display_name} size="sm" />
                    <span className="text-slate-700">{m.display_name}</span>
                  </div>
                  {m._net === 0 ? (
                    <Badge variant="success">Settled</Badge>
                  ) : m._net > 0 ? (
                    <Badge variant="success">owed {formatCents(m._net)}</Badge>
                  ) : (
                    <Badge variant="warning">owes {formatCents(m._owed)}</Badge>
                  )}
                </div>
              ))}
            </div>
            {totalOwed > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3 flex justify-between text-sm">
                <span className="font-medium text-slate-600">Total outstanding</span>
                <span className="font-bold text-slate-900">{formatCents(totalOwed)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment info */}
        {pp && (pp.gcash_number ?? pp.bank_account_number) && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">How to pay</h2>
                {pp.payer_display_name && (
                  <div className="flex items-center gap-2">
                    <Avatar name={pp.payer_display_name} size="sm" />
                    <span className="text-sm font-medium text-slate-700">{pp.payer_display_name}</span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {pp.gcash_number && (
                <div className="rounded-lg bg-slate-50 border border-slate-100 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Smartphone size={16} className="text-blue-500" />
                    <span className="text-sm font-semibold text-slate-700">GCash</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-slate-900">{pp.gcash_number}</span>
                    {pp.gcash_name && <span className="text-slate-400">({pp.gcash_name})</span>}
                    <CopyButton text={pp.gcash_number} label="Copy" className="ml-auto" />
                  </div>
                  {pp.gcash_qr_url && (
                    <div className="mt-3 flex justify-center">
                      <img
                        src={pp.gcash_qr_url}
                        alt="GCash QR"
                        className="w-full max-w-[280px] object-contain bg-white p-4 rounded-xl border border-slate-200 shadow-sm"
                      />
                    </div>
                  )}
                </div>
              )}

              {pp.bank_name && pp.bank_account_number && (
                <div className="rounded-lg bg-slate-50 border border-slate-100 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Landmark size={16} className="text-indigo-500" />
                    <span className="text-sm font-semibold text-slate-700">{pp.bank_name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-slate-900">{pp.bank_account_number}</span>
                    {pp.bank_account_name && <span className="text-slate-400">({pp.bank_account_name})</span>}
                    <CopyButton text={pp.bank_account_number} label="Copy" className="ml-auto" />
                  </div>
                  {pp.bank_qr_url && (
                    <div className="mt-3 flex justify-center">
                      <img
                        src={pp.bank_qr_url}
                        alt="Bank QR"
                        className="w-full max-w-[280px] object-contain bg-white p-4 rounded-xl border border-slate-200 shadow-sm"
                      />
                    </div>
                  )}
                </div>
              )}

              {pp.notes && <p className="text-xs text-slate-400 italic">{pp.notes}</p>}
            </CardContent>
          </Card>
        )}

        {/* Expense breakdown */}
        <Card>
          <CardHeader>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Expenses</h2>
          </CardHeader>
          <CardContent>
            {payload.expenses.length > 0 ? (
              <div className="flex flex-col gap-4">
                {payload.expenses.map((exp, i) => (
                  <div key={i} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-800">
                        {exp.item_name}
                        {exp.amount_cents < 0 && (
                          <Badge variant="success" className="ml-2">Credit</Badge>
                        )}
                      </span>
                      <span className={`font-semibold ${exp.amount_cents < 0 ? "text-green-600" : "text-slate-700"}`}>
                        {formatCents(exp.amount_cents)}
                      </span>
                    </div>
                    {exp.participants.length > 0 && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                        <Users size={12} />
                        <span>{exp.participants.length} participant{exp.participants.length !== 1 ? "s" : ""}</span>
                      </div>
                    )}
                    {exp.participants.length > 0 && (
                      <p className="mt-1 text-xs text-slate-400">
                        {exp.participants.map((p) => `${p.display_name} (${formatCents(p.share_cents)})`).join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Receipt} title="No expenses yet" description="Expenses will appear here once added." />
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 py-2">Powered by SettleUp</p>
      </div>
    </div>
  );
}
