"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { confirmPayment, rejectPayment } from "@/app/actions/friend-payments";
import type { PendingPayment } from "@/app/actions/friend-payments";
import { formatCents } from "@template/shared";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Check, X, Clock } from "lucide-react";
import type { GroupMember } from "@template/supabase";

type Props = {
  pending: PendingPayment[];
  members: GroupMember[];
  currentUserId: string;
  isAdminOrOwner: boolean;
};

export function PendingPayments({ pending, members, currentUserId, isAdminOrOwner }: Props): React.ReactElement | null {
  const [isPending, startTransition] = useTransition();
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const router = useRouter();

  if (pending.length === 0) return null;

  const memberMap = new Map(members.map((m) => [m.id, m]));

  function canResolve(payment: PendingPayment): boolean {
    const toMember = memberMap.get(payment.to_member_id);
    return isAdminOrOwner || toMember?.user_id === currentUserId;
  }

  function handleResolve(payment: PendingPayment, action: "confirm" | "reject"): void {
    setResolvingId(payment.id);
    startTransition(async () => {
      const result = action === "confirm" ? await confirmPayment(payment.id) : await rejectPayment(payment.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(action === "confirm" ? "Payment confirmed" : "Payment rejected");
        router.refresh();
      }
      setResolvingId(null);
    });
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Clock size={15} className="text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-800">
          Pending payment{pending.length !== 1 ? "s" : ""} ({pending.length})
        </h3>
      </div>
      <div className="flex flex-col gap-2">
        {pending.map((payment) => {
          const from = memberMap.get(payment.from_member_id);
          const to = memberMap.get(payment.to_member_id);
          const resolvable = canResolve(payment);
          return (
            <div key={payment.id} className="rounded-xl bg-white border border-amber-100 p-3 flex items-center gap-3">
              <Avatar name={from?.display_name ?? "?"} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700">
                  <span className="font-semibold">{from?.display_name ?? "Unknown"}</span> says they paid{" "}
                  <span className="font-semibold">{to?.display_name ?? "Unknown"}</span>{" "}
                  <span className="font-bold text-slate-900">{formatCents(payment.amount_cents)}</span>
                </p>
                {payment.note && <p className="text-xs text-slate-500 mt-0.5 truncate">“{payment.note}”</p>}
              </div>
              {resolvable ? (
                <div className="flex gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="primary"
                    leftIcon={Check}
                    isLoading={isPending && resolvingId === payment.id}
                    onClick={() => handleResolve(payment, "confirm")}
                  >
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={X}
                    disabled={isPending}
                    onClick={() => handleResolve(payment, "reject")}
                  >
                    Reject
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-slate-400 shrink-0">
                  Waiting for {to?.display_name ?? "recipient"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
