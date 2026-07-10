"use client";

import { formatCents, computePairwiseDebts } from "@template/shared";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { ArrowRight } from "lucide-react";
import type { GroupOverviewPayload } from "@template/shared";

type Props = {
  expenses: GroupOverviewPayload["expenses"];
  payments: NonNullable<GroupOverviewPayload["payments"]>;
};

export function OverviewPairwiseDebts({ expenses, payments }: Props): React.ReactElement | null {
  // Needs payer data on every expense to attribute debts; hide otherwise
  // (older DB payloads, or groups whose only expenses are payerless credits).
  if (!expenses.every((e) => Array.isArray(e.payers))) return null;

  const debts = computePairwiseDebts(expenses, payments);
  if (debts.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Who owes whom</h2>
        <p className="mt-1 text-xs text-slate-400 normal-case">
          The direct debts from each expense, before they&apos;re combined. The Settle Up plan below nets these into
          the fewest payments.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {debts.map((d, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-sm rounded-xl bg-slate-50/70 border border-slate-100 px-3 py-2.5"
          >
            <Avatar name={d.from_display_name} size="sm" />
            <span className="text-slate-700 min-w-0 truncate">{d.from_display_name}</span>
            <ArrowRight size={13} className="text-slate-400 shrink-0" />
            <Avatar name={d.to_display_name} size="sm" />
            <span className="text-slate-700 min-w-0 truncate">{d.to_display_name}</span>
            <span className="ml-auto font-semibold text-slate-900 shrink-0">{formatCents(d.amount_cents)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
