"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { recordPayment } from "@/app/actions/payments";
import { ContentDialog } from "@/components/ui/ContentDialog";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { formatCents, parsePHPAmount } from "@template/shared";
import { Banknote } from "lucide-react";
import type { SimplifiedDebt } from "@template/shared/types";

type Props = {
  debt: SimplifiedDebt;
  groupId: string;
};

export function SettleUpButton({ debt, groupId }: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [amountStr, setAmountStr] = useState((debt.amount_cents / 100).toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(): void {
    setError(null);
    const amountCents = parsePHPAmount(amountStr);
    if (!amountCents || amountCents <= 0) {
      setError("Enter a valid amount");
      return;
    }

    startTransition(async () => {
      const result = await recordPayment({
        group_id: groupId,
        from_member_id: debt.from_member_id,
        to_member_id: debt.to_member_id,
        amount_cents: amountCents,
      });
      if (result.error) {
        setError(result.error);
      } else {
        toast.success("Payment recorded!");
        setOpen(false);
        router.refresh();
      }
    });
  }

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
      <ContentDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Record Payment"
        size="sm"
      >
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
    </>
  );
}
