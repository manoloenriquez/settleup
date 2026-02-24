"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertPaymentProfile, uploadQRImageAction } from "@/app/actions/payment-profiles";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { UserPaymentProfile } from "@template/supabase";

type Props = {
  initial: UserPaymentProfile | null;
};

export function PaymentProfileForm({ initial }: Props): React.ReactElement {
  const [form, setForm] = useState({
    payer_display_name: initial?.payer_display_name ?? "",
    gcash_name: initial?.gcash_name ?? "",
    gcash_number: initial?.gcash_number ?? "",
    bank_name: initial?.bank_name ?? "",
    bank_account_name: initial?.bank_account_name ?? "",
    bank_account_number: initial?.bank_account_number ?? "",
    notes: initial?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await upsertPaymentProfile(form);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        router.refresh();
      }
    });
  }

  function handleQRUpload(type: "gcash" | "bank") {
    return async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const fd = new FormData();
      fd.append("file", file);
      startTransition(async () => {
        const result = await uploadQRImageAction(type, fd);
        if (result.error) setError(result.error);
        else router.refresh();
      });
    };
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4 max-w-lg">
      <Input
        label="Your display name (shown to friends)"
        value={form.payer_display_name}
        onChange={(e) => set("payer_display_name", e.target.value)}
        placeholder="e.g. Manolo"
      />

      <fieldset className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
        <legend className="text-sm font-semibold text-slate-700 px-1">GCash</legend>
        <Input
          label="GCash name"
          value={form.gcash_name}
          onChange={(e) => set("gcash_name", e.target.value)}
          placeholder="e.g. Juan D."
        />
        <Input
          label="GCash number"
          value={form.gcash_number}
          onChange={(e) => set("gcash_number", e.target.value)}
          placeholder="e.g. 09XX XXX XXXX"
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">GCash QR image</label>
          <input type="file" accept="image/*" onChange={handleQRUpload("gcash")} />
          {initial?.gcash_qr_url && (
            <img src={initial.gcash_qr_url} alt="GCash QR" className="mt-2 h-32 w-32 object-contain rounded border" />
          )}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
        <legend className="text-sm font-semibold text-slate-700 px-1">Bank Transfer</legend>
        <Input
          label="Bank name"
          value={form.bank_name}
          onChange={(e) => set("bank_name", e.target.value)}
          placeholder="e.g. BDO"
        />
        <Input
          label="Account name"
          value={form.bank_account_name}
          onChange={(e) => set("bank_account_name", e.target.value)}
          placeholder="e.g. Juan dela Cruz"
        />
        <Input
          label="Account number"
          value={form.bank_account_number}
          onChange={(e) => set("bank_account_number", e.target.value)}
          placeholder="e.g. 0012 3456 7890"
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">Bank QR image</label>
          <input type="file" accept="image/*" onChange={handleQRUpload("bank")} />
          {initial?.bank_qr_url && (
            <img src={initial.bank_qr_url} alt="Bank QR" className="mt-2 h-32 w-32 object-contain rounded border" />
          )}
        </div>
      </fieldset>

      <Input
        label="Instructions / notes"
        value={form.notes}
        onChange={(e) => set("notes", e.target.value)}
        placeholder="e.g. Please send the exact amount"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">Payment profile saved!</p>}

      <Button type="submit" isLoading={isPending}>
        Save Payment Profile
      </Button>
    </form>
  );
}
