"use client";

import { useState } from "react";
import { toast } from "sonner";
import { formatCents, buildNudgeMessage } from "@template/shared";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { SettleUpButton, SettleUpDialog } from "./SettleUpButton";
import { CheckCircle, BellRing, Zap, Check, Send } from "lucide-react";
import type { SimplifiedDebt, MemberBalance } from "@template/shared";

type Props = {
  debts: SimplifiedDebt[];
  groupId: string;
  groupName?: string;
  balances?: MemberBalance[];
  origin?: string;
  currentMemberId?: string | null;
};

export function DebtSummary({
  debts,
  groupId,
  groupName,
  balances,
  origin,
  currentMemberId = null,
}: Props): React.ReactElement {
  const [settleOpen, setSettleOpen] = useState(false);
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

  const totalCents = debts.reduce((sum, d) => sum + d.amount_cents, 0);
  const toReceiveCents = debts
    .filter((d) => d.to_member_id === currentMemberId)
    .reduce((sum, d) => sum + d.amount_cents, 0);
  const toPayCents = debts
    .filter((d) => d.from_member_id === currentMemberId)
    .reduce((sum, d) => sum + d.amount_cents, 0);
  // "Settle balance" targets my own debt first; creditors just record receipt.
  const myDebt =
    debts.find((d) => d.from_member_id === currentMemberId) ??
    debts.find((d) => d.to_member_id === currentMemberId) ??
    debts[0];

  function rowLabel(debt: SimplifiedDebt): { text: React.ReactNode; amountClass: string; sign: string } {
    if (debt.to_member_id === currentMemberId) {
      return {
        text: (
          <>
            <span className="font-bold">{debt.from_display_name}</span> owes you
          </>
        ),
        amountClass: "text-emerald-600",
        sign: "+",
      };
    }
    if (debt.from_member_id === currentMemberId) {
      return {
        text: (
          <>
            You owe <span className="font-bold">{debt.to_display_name}</span>
          </>
        ),
        amountClass: "text-rose-600",
        sign: "-",
      };
    }
    return {
      text: (
        <>
          <span className="font-bold">{debt.from_display_name}</span> owes{" "}
          <span className="font-bold">{debt.to_display_name}</span>
        </>
      ),
      amountClass: "text-slate-700",
      sign: "",
    };
  }

  return (
    <div className="space-y-4">
      {/* Settle-with-N-payments banner */}
      <div className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50/70 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
          <Zap size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">
            You can settle with {debts.length} payment{debts.length !== 1 ? "s" : ""}
          </p>
          <p className="text-xs text-slate-500">
            {formatCents(totalCents)} will be settled
          </p>
        </div>
      </div>

      {/* Who owes whom */}
      <div>
        <h4 className="mb-2 text-sm font-bold text-slate-900">Who owes whom</h4>
        <div className="flex flex-col divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {debts.map((debt) => {
            const label = rowLabel(debt);
            const otherName =
              debt.from_member_id === currentMemberId
                ? debt.to_display_name
                : debt.from_display_name;
            return (
              <div
                key={`${debt.from_member_id}-${debt.to_member_id}`}
                className="flex items-center gap-3 px-3.5 py-3"
              >
                <Avatar name={otherName} size="sm" />
                <p className="min-w-0 flex-1 truncate text-sm text-slate-700">{label.text}</p>
                <span className={`shrink-0 text-sm font-bold tabular-nums ${label.amountClass}`}>
                  {label.sign}
                  {formatCents(debt.amount_cents)}
                </span>
                {balances && (
                  <button
                    type="button"
                    onClick={() => handleRemind(debt)}
                    className="shrink-0 rounded-xl p-1.5 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600"
                    title={`Copy reminder for ${debt.from_display_name}`}
                    aria-label={`Copy reminder for ${debt.from_display_name}`}
                  >
                    <BellRing size={15} />
                  </button>
                )}
                <SettleUpButton debt={debt} groupId={groupId} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Suggested settlements */}
      <div className="rounded-2xl border-2 border-dashed border-brand-200 p-4">
        <h4 className="text-sm font-bold text-slate-900">Suggested settlements</h4>
        <div className="mt-2 flex flex-col gap-2.5">
          {debts.map((debt) => (
            <div
              key={`s-${debt.from_member_id}-${debt.to_member_id}`}
              className="flex items-center gap-3"
            >
              <Avatar name={debt.from_display_name} size="xs" />
              <p className="min-w-0 flex-1 truncate text-sm text-slate-700">
                <span className="font-semibold">
                  {debt.from_member_id === currentMemberId ? "You" : debt.from_display_name}
                </span>{" "}
                {debt.from_member_id === currentMemberId ? "pay" : "pays"}{" "}
                <span className="font-semibold">
                  {debt.to_member_id === currentMemberId ? "you" : debt.to_display_name}
                </span>
              </p>
              <span className="shrink-0 text-sm font-bold tabular-nums text-slate-900">
                {formatCents(debt.amount_cents)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Check size={12} strokeWidth={3} />
          </span>
          <span className="text-xs font-semibold text-slate-600">Settles everyone</span>
        </div>
      </div>

      {/* Totals + CTA (only meaningful when the viewer is a member) */}
      {currentMemberId && (toReceiveCents > 0 || toPayCents > 0) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
            <span className="text-sm font-medium text-slate-600">
              {toReceiveCents >= toPayCents ? "Total to receive" : "Total to pay"}
            </span>
            <span className={`text-base font-extrabold tabular-nums ${toReceiveCents >= toPayCents ? "text-emerald-600" : "text-rose-600"}`}>
              {formatCents(Math.max(toReceiveCents, toPayCents))}
            </span>
          </div>
          {myDebt && (
            <>
              <Button className="w-full" leftIcon={Send} onClick={() => setSettleOpen(true)}>
                Settle balance
              </Button>
              {settleOpen && (
                <SettleUpDialog
                  debt={myDebt}
                  groupId={groupId}
                  open={settleOpen}
                  onClose={() => setSettleOpen(false)}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
