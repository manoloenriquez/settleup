"use client";

import { toast } from "sonner";
import { formatCents, buildNudgeMessage } from "@template/shared";
import { Avatar } from "@/components/ui/Avatar";
import { SettleUpButton } from "./SettleUpButton";
import { ArrowRight, CheckCircle, BellRing } from "lucide-react";
import type { SimplifiedDebt, MemberBalance } from "@template/shared";

type Props = {
  debts: SimplifiedDebt[];
  groupId: string;
  groupName?: string;
  balances?: MemberBalance[];
  origin?: string;
};

export function DebtSummary({ debts, groupId, groupName, balances, origin }: Props): React.ReactElement {
  const tokenByMemberId = new Map((balances ?? []).map((b) => [b.member_id, b.share_token]));

  function handleRemind(debt: SimplifiedDebt): void {
    const token = tokenByMemberId.get(debt.from_member_id);
    const message = buildNudgeMessage({
      debtorName: debt.from_display_name,
      creditorName: debt.to_display_name,
      amountCents: debt.amount_cents,
      groupName: groupName ?? "your group",
      link: token && origin ? `${origin}/p/${token}` : null,
    });
    void navigator.clipboard.writeText(message);
    toast.success(`Reminder for ${debt.from_display_name} copied — paste it in your group chat`);
  }
  if (debts.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
        <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
          <CheckCircle size={18} className="text-emerald-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-emerald-800">All settled up!</p>
          <p className="text-xs text-emerald-600">No outstanding debts in this group.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Simplified Debts
        </h4>
        <span className="text-xs text-slate-400">{debts.length} transaction{debts.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {debts.map((debt) => (
          <div
            key={`${debt.from_member_id}-${debt.to_member_id}`}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 hover:border-amber-200 hover:shadow-sm transition-all"
          >
            <Avatar name={debt.from_display_name} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-800 truncate">
                  {debt.from_display_name}
                </span>
                <div className="flex items-center gap-1">
                  <ArrowRight size={13} className="text-amber-400 shrink-0" />
                </div>
                <span className="text-sm font-semibold text-slate-800 truncate">
                  {debt.to_display_name}
                </span>
              </div>
            </div>
            <Avatar name={debt.to_display_name} size="sm" />
            <span className="text-sm font-bold text-amber-700 whitespace-nowrap bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              {formatCents(debt.amount_cents)}
            </span>
            {balances && (
              <button
                type="button"
                onClick={() => handleRemind(debt)}
                className="rounded-xl p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                title={`Copy reminder for ${debt.from_display_name}`}
                aria-label={`Copy reminder for ${debt.from_display_name}`}
              >
                <BellRing size={15} />
              </button>
            )}
            <SettleUpButton debt={debt} groupId={groupId} />
          </div>
        ))}
      </div>
    </div>
  );
}
