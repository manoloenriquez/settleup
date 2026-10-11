"use client";

import { useRef, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateGroupData } from "@/lib/query-keys";
import { toast } from "sonner";
import { recordPayment } from "@/app/actions/payments";
import { useWebOutbox } from "@/components/OutboxProvider";
import { useOnline } from "@/hooks/useOnline";
import { ContentDialog } from "@/components/ui/ContentDialog";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { amountToInput, currencySymbol, parseAmountInput, type CurrencyCode } from "@template/shared";
import { formatCurrency, MONEY_LOCALE } from "@/lib/currency";
import { Banknote } from "lucide-react";
import type { SimplifiedDebt } from "@template/shared/types";

type DialogProps = {
  debt: SimplifiedDebt;
  groupId: string;
  /** Currency of the balance being settled; the payment is recorded in it. */
  currency: CurrencyCode;
  open: boolean;
  onClose: () => void;
};

/** Record-payment dialog, controllable from any trigger (row button or the "Settle balance" CTA). */
export function SettleUpDialog({ debt, groupId, currency, open, onClose }: DialogProps): React.ReactElement {
  const clientIdRef = useRef(crypto.randomUUID());
  const [amountStr, setAmountStr] = useState(amountToInput(debt.amount_cents, currency));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const online = useOnline();
  const { enqueue } = useWebOutbox();

  async function handleSubmit(): Promise<void> {
    if (isPending) return; // guard against double-submit creating duplicate payments
    setError(null);
    const amountCents = parseAmountInput(amountStr, currency);
    if (!amountCents || amountCents <= 0) {
      setError("Enter a valid amount");
      return;
    }

    // Client-generated UUID = the record_payment idempotency key, shared by
    // the online action and the offline outbox replay.
    const clientId = clientIdRef.current;

    if (!online) {
      try {
        await enqueue({
          id: clientId,
          kind: "payment.record",
          entityId: clientId,
          groupId,
          payload: {
            group_id: groupId,
            from_member_id: debt.from_member_id,
            to_member_id: debt.to_member_id,
            amount_cents: amountCents,
            currency_code: currency,
          },
          createdAt: new Date().toISOString(),
          summary: {
            title: `${debt.from_display_name} → ${debt.to_display_name}`,
            amountCents,
          },
        });
      } catch {
        toast.error(
          "Could not save on this device. Your changes are still here; please try again.",
        );
        return;
      }
      toast.info("Saved offline — will sync when you're back online");
      clientIdRef.current = crypto.randomUUID();
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
        currency_code: currency,
      });
      if (result.error) {
        setError(result.error);
      } else {
        toast.success("Payment recorded!");
        clientIdRef.current = crypto.randomUUID();
        onClose();
        invalidateGroupData(queryClient, groupId);
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
          leftAddon={currencySymbol(currency, MONEY_LOCALE)}
          inputMode="decimal"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
        />
        <p className="text-xs text-slate-500">Suggested: {formatCurrency(debt.amount_cents, currency)}</p>
        <p className="text-xs text-slate-500">
          Recording a payment does not transfer money. Pay using your agreed payment method first.
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
  currency: CurrencyCode;
};

export function SettleUpButton({ debt, groupId, currency }: Props): React.ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" variant="secondary" leftIcon={Banknote} onClick={() => setOpen(true)}>
        Settle
      </Button>
      <SettleUpDialog
        debt={debt}
        groupId={groupId}
        currency={currency}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
