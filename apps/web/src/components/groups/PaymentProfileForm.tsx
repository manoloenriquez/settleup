"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { upsertPaymentProfile, uploadQRImageAction } from "@/app/actions/payment-profiles";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Save, Upload } from "lucide-react";
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
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function set(field: keyof typeof form, value: string): void {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSave(e: React.FormEvent): void {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await upsertPaymentProfile(form);
      if (result.error) {
        setError(result.error);
      } else {
        toast.success("Payment settings saved");
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
        if (result.error) {
          setError(result.error);
        } else {
          toast.success("QR image uploaded");
          router.refresh();
        }
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

      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-700">GCash</h3>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
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
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-4 text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
              <Upload size={16} />
              Choose file
              <input type="file" accept="image/*" onChange={handleQRUpload("gcash")} className="hidden" />
            </label>
            {initial?.gcash_qr_url && (
              <img src={initial.gcash_qr_url} alt="GCash QR" className="mt-2 h-32 w-32 object-contain rounded border" />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-700">Bank Transfer</h3>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
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
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-4 text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
              <Upload size={16} />
              Choose file
              <input type="file" accept="image/*" onChange={handleQRUpload("bank")} className="hidden" />
            </label>
            {initial?.bank_qr_url && (
              <img src={initial.bank_qr_url} alt="Bank QR" className="mt-2 h-32 w-32 object-contain rounded border" />
            )}
          </div>
        </CardContent>
      </Card>

      <Input
        label="Instructions / notes"
        value={form.notes}
        onChange={(e) => set("notes", e.target.value)}
        placeholder="e.g. Please send the exact amount"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" isLoading={isPending} leftIcon={Save}>
        Save Payment Profile
      </Button>
    </form>
  );
}
