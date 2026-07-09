"use client";

import { useState } from "react";
import { formatCents } from "@template/shared";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { GroupOverviewPayload } from "@template/shared";

type Props = {
  members: GroupOverviewPayload["members"];
  expenses: GroupOverviewPayload["expenses"];
  payments: NonNullable<GroupOverviewPayload["payments"]>;
};

type MemberWithNet = GroupOverviewPayload["members"][number] & {
  _net: number;
  _owed: number;
};

type BreakdownLine = { label: string; detail?: string; amount_cents: number };

type Breakdown = {
  shares: BreakdownLine[];
  sharesTotal: number;
  paid: BreakdownLine[];
  paidTotal: number;
  sent: BreakdownLine[];
  sentTotal: number;
  received: BreakdownLine[];
  receivedTotal: number;
  clientNet: number;
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

/** Whether the payload carries enough detail (payers + participant member ids) to explain balances. */
function hasBreakdownData(expenses: GroupOverviewPayload["expenses"]): boolean {
  return expenses.every(
    (e) => Array.isArray(e.payers) && e.participants.every((p) => typeof p.member_id === "string"),
  );
}

/**
 * Reconstruct one member's balance from the payload, mirroring the server
 * formula: net = paid − shares + payments sent − payments received.
 */
function computeBreakdown(
  memberId: string,
  expenses: GroupOverviewPayload["expenses"],
  payments: NonNullable<GroupOverviewPayload["payments"]>,
): Breakdown {
  const shares: BreakdownLine[] = [];
  const paid: BreakdownLine[] = [];

  for (const e of expenses) {
    const share = e.participants.find((p) => p.member_id === memberId);
    if (share) {
      shares.push({
        label: e.item_name,
        detail: `${formatCents(share.share_cents)} of ${formatCents(e.amount_cents)}`,
        amount_cents: share.share_cents,
      });
    }
    const payer = e.payers?.find((p) => p.member_id === memberId);
    if (payer) {
      paid.push({ label: e.item_name, amount_cents: payer.paid_cents });
    }
  }

  const sent: BreakdownLine[] = payments
    .filter((p) => p.from_member_id === memberId)
    .map((p) => ({ label: `Paid ${p.to_display_name}`, amount_cents: p.amount_cents }));
  const received: BreakdownLine[] = payments
    .filter((p) => p.to_member_id === memberId)
    .map((p) => ({ label: `Received from ${p.from_display_name}`, amount_cents: p.amount_cents }));

  const sum = (lines: BreakdownLine[]): number => lines.reduce((s, l) => s + l.amount_cents, 0);
  const sharesTotal = sum(shares);
  const paidTotal = sum(paid);
  const sentTotal = sum(sent);
  const receivedTotal = sum(received);

  return {
    shares,
    sharesTotal,
    paid,
    paidTotal,
    sent,
    sentTotal,
    received,
    receivedTotal,
    clientNet: paidTotal - sharesTotal + sentTotal - receivedTotal,
  };
}

function BreakdownSection({ title, lines, sign }: { title: string; lines: BreakdownLine[]; sign: "+" | "-" }): React.ReactElement | null {
  if (lines.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{title}</p>
      <div className="flex flex-col gap-1">
        {lines.map((line, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="text-slate-600 min-w-0 truncate">
              {line.label}
              {line.detail && <span className="text-slate-400"> — {line.detail}</span>}
            </span>
            <span className={`whitespace-nowrap font-medium ${sign === "+" ? "text-emerald-600" : "text-slate-500"}`}>
              {sign === "+" ? "+" : "−"}
              {formatCents(line.amount_cents)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OverviewMemberBreakdown({ members, expenses, payments }: Props): React.ReactElement {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const sorted = sortedMembers(members);
  const canExplain = hasBreakdownData(expenses);
  const totalOwed = members.reduce((sum, m) => sum + (m.owed_cents ?? Math.max(0, -(m.net_cents ?? 0))), 0);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Who owes</h2>
        {canExplain && (
          <p className="mt-1 text-xs text-slate-400 normal-case">Tap a name to see how their balance was calculated.</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          {sorted.map((m) => {
            const isExpanded = expandedId === m.member_id;
            const rowTone =
              m._net < 0
                ? "border-l-amber-400 bg-amber-50/50"
                : m._net > 0
                  ? "border-l-emerald-400 bg-emerald-50/50"
                  : "border-l-slate-200 bg-slate-50/50";
            const row = (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar name={m.display_name} size="sm" />
                  <span className="text-slate-700 truncate">{m.display_name}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {m._net === 0 ? (
                    <Badge variant="success">Settled</Badge>
                  ) : m._net > 0 ? (
                    <Badge variant="success">owed {formatCents(m._net)}</Badge>
                  ) : (
                    <Badge variant="warning">owes {formatCents(m._owed)}</Badge>
                  )}
                  {canExplain &&
                    (isExpanded ? (
                      <ChevronUp size={14} className="text-slate-400" />
                    ) : (
                      <ChevronDown size={14} className="text-slate-400" />
                    ))}
                </div>
              </>
            );

            if (!canExplain) {
              return (
                <div
                  key={m.member_id}
                  className={`flex items-center justify-between text-sm rounded-xl px-3 py-2.5 border-l-4 ${rowTone}`}
                >
                  {row}
                </div>
              );
            }

            const breakdown = isExpanded ? computeBreakdown(m.member_id, expenses, payments) : null;
            const arithmeticMatches = breakdown !== null && breakdown.clientNet === m._net;

            return (
              <div key={m.member_id} className={`rounded-xl border-l-4 ${rowTone} overflow-hidden`}>
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : m.member_id)}
                  aria-expanded={isExpanded}
                  className="w-full flex items-center justify-between text-sm px-3 py-2.5 hover:shadow-sm transition-all text-left"
                >
                  {row}
                </button>
                {isExpanded && breakdown && (
                  <div className="border-t border-slate-200/60 bg-white/60 px-3 py-3 flex flex-col gap-3">
                    {breakdown.shares.length === 0 &&
                    breakdown.paid.length === 0 &&
                    breakdown.sent.length === 0 &&
                    breakdown.received.length === 0 ? (
                      <p className="text-xs text-slate-400">No expenses or payments involve {m.display_name} yet.</p>
                    ) : (
                      <>
                        <BreakdownSection title="Their share of expenses" lines={breakdown.shares} sign="-" />
                        <BreakdownSection title="They paid for" lines={breakdown.paid} sign="+" />
                        <BreakdownSection title="Payments they made" lines={breakdown.sent} sign="+" />
                        <BreakdownSection title="Payments they received" lines={breakdown.received} sign="-" />
                        {arithmeticMatches && (
                          <div className="border-t border-slate-100 pt-2 text-xs text-slate-500">
                            <div className="flex items-baseline justify-between gap-3">
                              <span>
                                Paid {formatCents(breakdown.paidTotal + breakdown.sentTotal)} − share{" "}
                                {formatCents(breakdown.sharesTotal + breakdown.receivedTotal)}
                              </span>
                              <span className="font-semibold text-slate-700 whitespace-nowrap">
                                {m._net === 0
                                  ? "Settled"
                                  : m._net > 0
                                    ? `is owed ${formatCents(m._net)}`
                                    : `owes ${formatCents(m._owed)}`}
                              </span>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {totalOwed > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-3 flex justify-between text-sm">
            <span className="font-medium text-slate-600">Total outstanding</span>
            <span className="font-bold text-slate-900">{formatCents(totalOwed)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
