"use client";

import { formatCents } from "@template/shared";
import { Avatar } from "@/components/ui/Avatar";
import { SettleUpButton } from "./SettleUpButton";
import { ArrowRight, CheckCircle } from "lucide-react";
import type { SimplifiedDebt } from "@template/shared";

type Props = {
  debts: SimplifiedDebt[];
  groupId: string;
};

export function DebtSummary({ debts, groupId }: Props): React.ReactElement {
  if (debts.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-4">
        <CheckCircle size={20} className="text-emerald-600 shrink-0" />
        <p className="text-sm font-medium text-emerald-700">All settled! No outstanding debts.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        Simplified Debts
      </h4>
      <div className="grid grid-cols-1 gap-2">
        {debts.map((debt) => (
          <div
            key={`${debt.from_member_id}-${debt.to_member_id}`}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3"
          >
            <Avatar name={debt.from_display_name} size="sm" />
            <span className="text-sm font-medium text-slate-700 truncate">
              {debt.from_display_name}
            </span>
            <ArrowRight size={14} className="text-slate-400 shrink-0" />
            <Avatar name={debt.to_display_name} size="sm" />
            <span className="text-sm font-medium text-slate-700 truncate">
              {debt.to_display_name}
            </span>
            <span className="ml-auto text-sm font-bold text-amber-600 whitespace-nowrap mr-2">
              {formatCents(debt.amount_cents)}
            </span>
            <SettleUpButton debt={debt} groupId={groupId} />
          </div>
        ))}
      </div>
    </div>
  );
}
