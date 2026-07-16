"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { recordPayment } from "@/app/actions/payments";
import { useWebOutbox } from "@/components/OutboxProvider";
import { useOnline } from "@/hooks/useOnline";
import { ContentDialog } from "@/components/ui/ContentDialog";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { formatCents, parsePHPAmount } from "@template/shared";
import { Banknote } from "lucide-react";
import type { SimplifiedDebt } from "@template/shared/types";

type DialogProps = {
  debt: SimplifiedDebt;
  groupId: string;
  open: boolean;
  onClose: () => void;
};

/** Record-payment dialog, controllable from any trigger (row button or the "Settle balance" CTA). */
export function SettleUpDialog({ debt, groupId, open, onClose }: DialogProps): React.ReactElement {
  const [amountStr, setAmountStr] = useState((debt.amount_cents / 100).toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const online = useOnline();
  const { enqueue } = useWebOutbox();

  function handleSubmit(): void {
    if (isPending) return; // guard against double-submit creating duplicate payments
    setError(null);
    const amountCents = parsePHPAmount(amountStr);
    if (!amountCents || amountCents <= 0) {
      setError("Enter a valid amount");
      return;
    }

    // Client-generated UUID = the record_payment idempotency key, shared by
    // the online action and the offline outbox replay.
    const clientId = crypto.randomUUID();

    if (!online) {
      void enqueue({
        id: clientId,
        kind: "payment.record",
        entityId: clientId,
        groupId,
        payload: {
          group_id: groupId,
          from_member_id: debt.from_member_id,
          to_member_id: debt.to_member_id,
          amount_cents: amountCents,
        },
        createdAt: new Date().toISOString(),
        summary: {
          title: `${debt.from_display_name} → ${debt.to_display_name}`,
          amountCents,
        },
      });
      toast.info("Saved offline — will sync when you're back online");
      onClose();
      return;
    }

    startTransition(async () => {
      const result = await recordPayment({
        id: clientId,
        group_id: groupId,
        from_member_id: debt.from_member_id,
        to_member_id: debt.to_member_id,
        amount_cents: amountCents,
      });
      if (result.error) {
        setError(result.error);
      } else {
        toast.success("Payment recorded!");
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <ContentDialog open={open} onClose={onClose} title="Record Payment" size="sm">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">
          <span className="font-medium">{debt.from_display_name}</span> pays{" "}
          <span className="font-medium">{debt.to_display_name}</span>
        </p>
        <Input
          label="Amount"
          leftAddon="₱"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
        />
        <p className="text-xs text-slate-500">
          Suggested: {formatCents(debt.amount_cents)}
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={handleSubmit} isLoading={isPending}>
          Record Payment
        </Button>
      </div>
    </ContentDialog>
  );
}

type Props = {
  debt: SimplifiedDebt;
  groupId: string;
};

export function SettleUpButton({ debt, groupId }: Props): React.ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        leftIcon={Banknote}
        onClick={() => setOpen(true)}
      >
        Settle
      </Button>
      <SettleUpDialog debt={debt} groupId={groupId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
