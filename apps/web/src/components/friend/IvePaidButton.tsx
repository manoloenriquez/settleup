"use client";

import { useState, useTransition } from "react";
import { submitFriendPayment } from "@/app/actions/friend-payments";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatCents, parsePHPAmount } from "@template/shared";
import { CheckCircle2, HandCoins } from "lucide-react";

type Props = {
  shareToken: string;
  toMemberId: string;
  creditorName: string;
  suggestedAmountCents: number;
};

export function IvePaidButton({
  shareToken,
  toMemberId,
  creditorName,
  suggestedAmountCents,
}: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [amountStr, setAmountStr] = useState((suggestedAmountCents / 100).toFixed(2));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(): void {
    setError(null);
    const amountCents = parsePHPAmount(amountStr);
    if (!amountCents || amountCents <= 0) {
      setError("Enter a valid amount.");
      return;
    }

    startTransition(async () => {
      const result = await submitFriendPayment({
        share_token: shareToken,
        to_member_id: toMemberId,
        amount_cents: amountCents,
        note: note.trim() || undefined,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setSubmitted(true);
      }
    });
  }

  if (submitted) {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-2.5">
        <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-emerald-800">Payment submitted</p>
          <p className="text-emerald-700 mt-0.5">
            {creditorName} will confirm it. Your balance updates once confirmed.
          </p>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <Button variant="secondary" leftIcon={HandCoins} onClick={() => setOpen(true)}>
        I&apos;ve paid {creditorName}
      </Button>
    );
  }

  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 flex flex-col gap-3">
      <p className="text-sm font-semibold text-slate-700">Tell {creditorName} you&apos;ve paid</p>
      <Input
        label="Amount"
        leftAddon="₱"
        value={amountStr}
        onChange={(e) => setAmountStr(e.target.value)}
        inputMode="decimal"
      />
      <p className="text-xs text-slate-500">Suggested: {formatCents(suggestedAmountCents)}</p>
      <Input
        label="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. GCash ref. 1234567"
        maxLength={280}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={handleSubmit} isLoading={isPending}>
          Submit
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
          Cancel
        </Button>
      </div>
      <p className="text-xs text-slate-400">
        This doesn&apos;t move money — it just lets {creditorName} know to expect your payment.
      </p>
    </div>
  );
}
