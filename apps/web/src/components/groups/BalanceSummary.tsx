"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { recordPayment, undoLastPayment, undoMyLastPayment } from "@/app/actions/payments";
import { deleteMember } from "@/app/actions/members";
import { formatCents, parsePHPAmount, simplifyDebts } from "@template/shared";
import { CopyButton } from "./CopyButton";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import Link from "next/link";
import { Undo2, Link as LinkIcon, MessageSquare, Trash2, Banknote, CreditCard } from "lucide-react";
import type { GroupMember } from "@template/supabase";
import type { MemberBalance, SimplifiedDebt, CreditorPaymentProfile } from "@template/shared";

type Props = {
  members: GroupMember[];
  balances: MemberBalance[];
  groupId: string;
  groupName: string;
  paymentProfileText?: string;
  origin: string;
  creditorProfiles?: CreditorPaymentProfile[];
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
  creditorProfiles,
}: Props): React.ReactElement {
  const creditorMemberIds = new Set(creditorProfiles?.map((cp) => cp.member_id) ?? []);
  const [isPending, startTransition] = useTransition();
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [fromMemberId, setFromMemberId] = useState("");
  const [toMemberId, setToMemberId] = useState("");
  const [paymentAmountStr, setPaymentAmountStr] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GroupMember | null>(null);
  const [undoTarget, setUndoTarget] = useState<MemberBalance | null>(null);
  const [showUndoMine, setShowUndoMine] = useState(false);
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

  function handleRecordPayment(): void {
    if (isPending) return; // guard against double-submit creating duplicate payments
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
        toast.success("Payment recorded");
        router.refresh();
      }
    });
  }

  function handleUndo(balance: MemberBalance): void {
    startTransition(async () => {
      const result = await undoLastPayment(balance.member_id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Payment undone");
        router.refresh();
      }
    });
  }

  function handleUndoMine(): void {
    startTransition(async () => {
      const result = await undoMyLastPayment(groupId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Your last payment was undone");
        router.refresh();
      }
    });
  }

  function handleDeleteMember(): void {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteMember(deleteTarget.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${deleteTarget.display_name} removed`);
        router.refresh();
      }
      setDeleteTarget(null);
    });
  }

  const groupMessage = buildGroupMessage(balances, debts);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-700">Members</h3>
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            leftIcon={Banknote}
            onClick={() => setShowPaymentForm(!showPaymentForm)}
          >
            {showPaymentForm ? "Cancel" : "Record Payment"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={Undo2}
            onClick={() => setShowUndoMine(true)}
          >
            Undo
          </Button>
          <CopyButton text={groupMessage} label="Copy All" />
        </div>
      </div>

      {/* Payment form */}
      {showPaymentForm && (
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 flex flex-col gap-3 animate-slide-down">
          <p className="text-sm font-semibold text-brand-800">Record a payment</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="From"
              value={fromMemberId}
              onChange={(e) => setFromMemberId(e.target.value)}
            >
              <option value="">Select member</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </Select>
            <Select
              label="To"
              value={toMemberId}
              onChange={(e) => setToMemberId(e.target.value)}
            >
              <option value="">Select member</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </Select>
          </div>
          <Input
            label="Amount"
            leftAddon="₱"
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
            className={`flex items-center gap-3 rounded-2xl border p-4 transition-all hover:shadow-sm ${
              owes
                ? "border-amber-200 bg-amber-50/60"
                : isOwed
                  ? "border-emerald-200 bg-emerald-50/60"
                  : "border-slate-200 bg-white"
            }`}
          >
            <Avatar name={balance.display_name} size="md" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900 truncate text-sm">{balance.display_name}</p>
              {isSettled && (
                <p className="text-xs text-emerald-600 font-medium">All settled</p>
              )}
              {owes && (
                <p className="text-xs text-amber-700 font-medium">
                  Owes {formatCents(Math.abs(balance.net_cents))}
                </p>
              )}
              {isOwed && (
                <p className="text-xs text-emerald-700 font-medium">
                  Owed {formatCents(balance.net_cents)}
                </p>
              )}
              {isOwed && !creditorMemberIds.has(balance.member_id) && (
                <Link href="/account/payment" className="flex items-center gap-1 text-[10px] text-brand-600 hover:text-brand-700 mt-0.5">
                  <CreditCard size={10} />
                  Add payment details
                </Link>
              )}
            </div>

            {/* Amount badge */}
            {owes && (
              <span className="shrink-0 text-xs font-bold text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                {formatCents(Math.abs(balance.net_cents))}
              </span>
            )}
            {isOwed && (
              <span className="shrink-0 text-xs font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                +{formatCents(balance.net_cents)}
              </span>
            )}
            {isSettled && <Badge variant="success">Settled</Badge>}

            {owes && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => setUndoTarget(balance)}
                className="rounded-xl p-1.5 text-slate-400 hover:text-slate-600 hover:bg-white transition-colors disabled:opacity-50"
                title="Undo last payment"
              >
                <Undo2 size={15} />
              </button>
            )}

            <DropdownMenu
              items={[
                {
                  label: "Copy Link",
                  onClick: () => {
                    void navigator.clipboard.writeText(link);
                    toast.success("Link copied");
                  },
                  icon: <LinkIcon size={14} />,
                },
                {
                  label: "Copy Message",
                  onClick: () => {
                    void navigator.clipboard.writeText(message);
                    toast.success("Message copied");
                  },
                  icon: <MessageSquare size={14} />,
                },
                {
                  label: "Remove Member",
                  onClick: () => setDeleteTarget(member),
                  variant: "danger",
                  icon: <Trash2 size={14} />,
                },
              ]}
            />
          </div>
        );
      })}

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Remove member"
        description={`Remove ${deleteTarget?.display_name ?? ""} from the group? Their expenses will be unlinked and balances recalculated.`}
        confirmLabel="Remove"
        confirmVariant="danger"
        onConfirm={handleDeleteMember}
        isLoading={isPending}
      />

      {/* Undo payment confirmation dialog */}
      <Dialog
        open={undoTarget !== null}
        onClose={() => setUndoTarget(null)}
        title="Undo last payment"
        description={`Undo the most recent payment from ${undoTarget?.display_name ?? ""}? You can undo payments you recorded, or any payment if you're a group admin.`}
        confirmLabel="Undo payment"
        confirmVariant="danger"
        onConfirm={() => {
          if (undoTarget) handleUndo(undoTarget);
          setUndoTarget(null);
        }}
        isLoading={isPending}
      />

      {/* Undo my last payment confirmation dialog */}
      <Dialog
        open={showUndoMine}
        onClose={() => setShowUndoMine(false)}
        title="Undo my last payment"
        description="Undo the most recent payment you recorded in this group? Payments recorded by others are not affected."
        confirmLabel="Undo payment"
        confirmVariant="danger"
        onConfirm={() => {
          handleUndoMine();
          setShowUndoMine(false);
        }}
        isLoading={isPending}
      />
    </div>
  );
}
