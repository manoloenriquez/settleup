"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  preparePaymentAttempt,
  readPaymentAttempt,
  markPaymentAttemptSubmitted,
  type PaymentAttempt,
} from "@/lib/payment-attempts";
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
  const storageKey = `tabkind:payment-report:${shareToken}:${toMemberId}`;
  const router = useRouter();
  const [locked, setLocked] = useState(false);
  const [restored, setRestored] = useState(false);
  const [open, setOpen] = useState(false);
  const [amountStr, setAmountStr] = useState((suggestedAmountCents / 100).toFixed(2));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    try {
      const saved = readPaymentAttempt(localStorage, storageKey);
      if (saved) {
        setAmountStr((saved.amountCents / 100).toFixed(2));
        setNote(saved.note);
        setSubmitted(saved.submitted);
        setLocked(true);
      }
      setRestored(true);
    } catch {
      setError(
        "Saved payment information could not be read. Check your report history before trying again.",
      );
    }
  }, [storageKey]);

  function handleSubmit(): void {
    if (!restored || isPending) return;
    setError(null);
    const amountCents = parsePHPAmount(amountStr);
    if (!amountCents || amountCents <= 0) {
      setError("Enter a valid amount.");
      return;
    }

    let attempt: PaymentAttempt;
    try {
      attempt = preparePaymentAttempt(
        localStorage,
        storageKey,
        { amountCents, note: note.trim() },
        () => crypto.randomUUID(),
      );
      setLocked(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save a retry-safe payment report on this device.",
      );
      return;
    }
    startTransition(async () => {
      const result = await submitFriendPayment({
        share_token: shareToken,
        request_id: attempt.id,
        to_member_id: toMemberId,
        amount_cents: amountCents,
        note: note.trim() || undefined,
      });
      if (result.error) {
        setError(result.error);
      } else {
        try {
          markPaymentAttemptSubmitted(localStorage, storageKey, attempt);
        } catch {
          /* The original durable ID remains available for a safe retry. */
        }
        setSubmitted(true);
        router.refresh();
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
          <button
            type="button"
            className="mt-3 text-xs underline"
            onClick={() => {
              try {
                localStorage.removeItem(storageKey);
                setSubmitted(false);
                setLocked(false);
                setOpen(true);
                setNote("");
              } catch {
                setError("Could not start another report on this device.");
              }
            }}
          >
            Report a separate payment
          </button>
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
        disabled={locked || !restored}
        inputMode="decimal"
      />
      <p className="text-xs text-slate-500">Suggested: {formatCents(suggestedAmountCents)}</p>
      <Input
        label="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. GCash ref. 1234567"
        disabled={locked || !restored}
        maxLength={280}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={handleSubmit} isLoading={isPending} disabled={!restored}>
          {locked ? "Retry saved report" : "Submit"}
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
