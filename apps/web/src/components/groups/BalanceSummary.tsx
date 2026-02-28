"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { recordPayment, undoLastPayment } from "@/app/actions/payments";
import { deleteMember } from "@/app/actions/members";
import { formatCents, parsePHPAmount, simplifyDebts } from "@template/shared";
import { CopyButton } from "./CopyButton";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { GroupMember } from "@template/supabase";
import type { MemberBalance, SimplifiedDebt } from "@template/shared";

type Props = {
  members: GroupMember[];
  balances: MemberBalance[];
  groupId: string;
  groupName: string;
  paymentProfileText?: string;
  origin: string;
};

function buildMessage(
  member: GroupMember,
  balance: MemberBalance,
  groupName: string,
  paymentText: string,
  link: string,
  debtsFrom: SimplifiedDebt[],
  debtsTo: SimplifiedDebt[],
): string {
  if (balance.net_cents < 0) {
    const debtLines = debtsFrom.map(
      (d) => `  → ${formatCents(d.amount_cents)} to ${d.to_display_name}`,
    );
    return [
      `Hi ${member.display_name}! You owe ${formatCents(-balance.net_cents)} for ${groupName}.`,
      ...(debtLines.length > 0 ? debtLines : []),
      paymentText,
      `Link: ${link}`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (balance.net_cents > 0) {
    const owedLines = debtsTo.map(
      (d) => `  ← ${formatCents(d.amount_cents)} from ${d.from_display_name}`,
    );
    return [
      `Hi ${member.display_name}! You are owed ${formatCents(balance.net_cents)} for ${groupName}.`,
      ...(owedLines.length > 0 ? owedLines : []),
      `Link: ${link}`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return `Hi ${member.display_name}! You're all settled for ${groupName}.`;
}

function buildGroupMessage(
  balances: MemberBalance[],
  debts: SimplifiedDebt[],
): string {
  const total = debts.reduce((sum, d) => sum + d.amount_cents, 0);
  const lines = [
    "SIMPLIFIED DEBTS",
    ...debts.map(
      (d) => `${d.from_display_name} → ${d.to_display_name}: ${formatCents(d.amount_cents)}`,
    ),
    ...(debts.length === 0 ? ["All settled!"] : []),
    `TOTAL: ${formatCents(total)}`,
  ];
  return lines.join("\n");
}

export function BalanceSummary({
  members,
  balances,
  groupId,
  groupName,
  paymentProfileText = "",
  origin,
}: Props): React.ReactElement {
  const [isPending, startTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [fromMemberId, setFromMemberId] = useState("");
  const [toMemberId, setToMemberId] = useState("");
  const [paymentAmountStr, setPaymentAmountStr] = useState("");
  const router = useRouter();

  const memberMap = new Map(members.map((m) => [m.id, m]));

  // Compute simplified pairwise debts
  const debts = simplifyDebts(balances);
  const debtsFromMap = new Map<string, SimplifiedDebt[]>();
  const debtsToMap = new Map<string, SimplifiedDebt[]>();
  for (const d of debts) {
    const fromList = debtsFromMap.get(d.from_member_id) ?? [];
    fromList.push(d);
    debtsFromMap.set(d.from_member_id, fromList);
    const toList = debtsToMap.get(d.to_member_id) ?? [];
    toList.push(d);
    debtsToMap.set(d.to_member_id, toList);
  }

  function handleRecordPayment() {
    setPaymentError(null);
    const amount_cents = parsePHPAmount(paymentAmountStr);
    if (!fromMemberId || !toMemberId || !amount_cents || amount_cents <= 0) {
      setPaymentError("Please fill in all fields with valid values.");
      return;
    }
    if (fromMemberId === toMemberId) {
      setPaymentError("Cannot pay yourself.");
      return;
    }
    startTransition(async () => {
      const result = await recordPayment({
        group_id: groupId,
        from_member_id: fromMemberId,
        to_member_id: toMemberId,
        amount_cents,
      });
      if (result.error) {
        setPaymentError(result.error);
      } else {
        setShowPaymentForm(false);
        setFromMemberId("");
        setToMemberId("");
        setPaymentAmountStr("");
        router.refresh();
      }
    });
  }

  function handleUndo(balance: MemberBalance) {
    startTransition(async () => {
      await undoLastPayment(balance.member_id);
      router.refresh();
    });
  }

  function handleDeleteMember(member: GroupMember) {
    if (
      !window.confirm(
        `Remove ${member.display_name} from the group? Their expenses will be unlinked and balances recalculated.`,
      )
    ) {
      return;
    }
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteMember(member.id);
      if (result.error) {
        setDeleteError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  const groupMessage = buildGroupMessage(balances, debts);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-700">Balances</h3>
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowPaymentForm(!showPaymentForm)}
          >
            {showPaymentForm ? "Cancel" : "Record Payment"}
          </Button>
          <CopyButton text={groupMessage} label="Copy All" />
        </div>
      </div>

      {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}

      {/* Payment form */}
      {showPaymentForm && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold text-indigo-800">Record a payment</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">From</label>
              <select
                value={fromMemberId}
                onChange={(e) => setFromMemberId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select member</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
              <select
                value={toMemberId}
                onChange={(e) => setToMemberId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select member</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Input
            label="Amount (₱)"
            value={paymentAmountStr}
            onChange={(e) => setPaymentAmountStr(e.target.value)}
            placeholder="e.g. 1500.00"
          />
          {paymentError && <p className="text-sm text-red-600">{paymentError}</p>}
          <Button
            variant="primary"
            size="sm"
            isLoading={isPending}
            onClick={handleRecordPayment}
          >
            Submit Payment
          </Button>
        </div>
      )}

      {balances.length === 0 && (
        <p className="text-sm text-slate-400">No members yet.</p>
      )}

      {balances.map((balance) => {
        const member = memberMap.get(balance.member_id);
        if (!member) return null;
        const link = `${origin}/p/${member.share_token}`;
        const memberDebtsFrom = debtsFromMap.get(balance.member_id) ?? [];
        const memberDebtsTo = debtsToMap.get(balance.member_id) ?? [];
        const message = buildMessage(member, balance, groupName, paymentProfileText, link, memberDebtsFrom, memberDebtsTo);

        const isSettled = balance.net_cents === 0;
        const isOwed = balance.net_cents > 0;
        const owes = balance.net_cents < 0;

        return (
          <div
            key={balance.member_id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-900 truncate">{balance.display_name}</p>
              {isSettled && (
                <p className="text-sm font-semibold text-green-600">Settled ✓</p>
              )}
              {owes && memberDebtsFrom.map((d) => (
                <p key={d.to_member_id} className="text-sm font-semibold text-red-500">
                  owes {formatCents(d.amount_cents)} to {d.to_display_name}
                </p>
              ))}
              {isOwed && memberDebtsTo.map((d) => (
                <p key={d.from_member_id} className="text-sm font-semibold text-green-600">
                  owed {formatCents(d.amount_cents)} by {d.from_display_name}
                </p>
              ))}
            </div>

            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                isSettled
                  ? "bg-green-100 text-green-700"
                  : isOwed
                    ? "bg-green-100 text-green-700"
                    : "bg-amber-100 text-amber-700"
              }`}
            >
              {isSettled ? "Settled" : isOwed ? "Owed" : "Pending"}
            </span>

            {owes && (
              <Button
                variant="ghost"
                size="sm"
                isLoading={isPending}
                onClick={() => handleUndo(balance)}
              >
                Undo
              </Button>
            )}

            <CopyButton text={link} label="Copy Link" />
            <CopyButton text={message} label="Copy Msg" />

            <Button
              variant="ghost"
              size="sm"
              isLoading={isPending}
              onClick={() => handleDeleteMember(member)}
              className="text-red-500 hover:text-red-700"
            >
              Remove
            </Button>
          </div>
        );
      })}
    </div>
  );
}
