"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { markPaid, undoLastPayment } from "@/app/actions/payments";
import { deleteMember } from "@/app/actions/members";
import { formatCents } from "@template/shared";
import { CopyButton } from "./CopyButton";
import { Button } from "@/components/ui/Button";
import type { GroupMember } from "@template/supabase";
import type { MemberBalance } from "@template/shared";

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
): string {
  return [
    `Hi ${member.display_name}! You owe ${formatCents(balance.owed_cents)} for ${groupName}.`,
    paymentText,
    `Link: ${link}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildGroupMessage(
  balances: MemberBalance[],
  payerName: string,
  _groupName: string,
): string {
  const pending = balances.filter((b) => !b.is_paid);
  const total = pending.reduce((sum, b) => sum + b.owed_cents, 0);
  const lines = [
    `FINAL AMOUNTS TO PAY (TO ${payerName || "PAYER"})`,
    ...pending.map((b) => `${b.display_name} — ${formatCents(b.owed_cents)}`),
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
  const router = useRouter();

  const memberMap = new Map(members.map((m) => [m.id, m]));

  function handleMarkPaid(balance: MemberBalance) {
    startTransition(async () => {
      await markPaid(balance.member_id, groupId, balance.owed_cents);
      router.refresh();
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

  const payerName = paymentProfileText.split("\n")[0] ?? "";
  const groupMessage = buildGroupMessage(balances, payerName, groupName);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-700">Balances</h3>
        <CopyButton text={groupMessage} label="Copy All" />
      </div>

      {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}

      {balances.length === 0 && (
        <p className="text-sm text-slate-400">No members yet.</p>
      )}

      {balances.map((balance) => {
        const member = memberMap.get(balance.member_id);
        if (!member) return null;
        const link = `${origin}/p/${member.share_token}`;
        const message = buildMessage(member, balance, groupName, paymentProfileText, link);

        return (
          <div
            key={balance.member_id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-900 truncate">{balance.display_name}</p>
              <p
                className={`text-sm font-semibold ${
                  balance.is_paid ? "text-green-600" : "text-red-500"
                }`}
              >
                {balance.is_paid ? "Paid ✓" : formatCents(balance.owed_cents)}
              </p>
            </div>

            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                balance.is_paid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              {balance.is_paid ? "Paid" : "Pending"}
            </span>

            {!balance.is_paid && (
              <Button
                variant="primary"
                size="sm"
                isLoading={isPending}
                onClick={() => handleMarkPaid(balance)}
              >
                Mark Paid
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              isLoading={isPending}
              onClick={() => handleUndo(balance)}
            >
              Undo
            </Button>

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
