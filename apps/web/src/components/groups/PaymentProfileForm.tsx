"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { removeQRImageAction, upsertPaymentProfile, uploadQRImageAction } from "@/app/actions/payment-profiles";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Save, Upload } from "lucide-react";
import type { UserPaymentProfile } from "@template/supabase";

type Props = {
  initial: UserPaymentProfile | null;
};

export function PaymentProfileForm({ initial }: Props): React.ReactElement {
  const queryClient = useQueryClient();
  function invalidateProfileQueries(): void {
    void queryClient.invalidateQueries({ queryKey: ["payment-profile"] });
    void queryClient.invalidateQueries({ queryKey: ["creditor-profiles"] });
  }
  const [form, setForm] = useState({
    payer_display_name: initial?.payer_display_name ?? "",
    gcash_name: initial?.gcash_name ?? "",
    gcash_number: initial?.gcash_number ?? "",
    bank_name: initial?.bank_name ?? "",
    bank_account_name: initial?.bank_account_name ?? "",
    bank_account_number: initial?.bank_account_number ?? "",
    notes: initial?.notes ?? "",
  });
  // Privacy: both off unless the person opts in (same as the mobile app).
  const [showOnLinks, setShowOnLinks] = useState(initial?.show_on_shared_links ?? false);
  const [fullNumbers, setFullNumbers] = useState(initial?.share_full_numbers ?? false);
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
      const result = await upsertPaymentProfile({
        ...form,
        show_on_shared_links: showOnLinks,
        share_full_numbers: showOnLinks && fullNumbers,
      });
      if (result.error) {
        setError(result.error);
      } else {
        toast.success("Payment settings saved");
        router.refresh();
        invalidateProfileQueries();
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
          invalidateProfileQueries();
        }
      });
    };
  }

  function handleQRRemove(type: "gcash" | "bank") {
    startTransition(async () => {
      const result = await removeQRImageAction(type);
      if (result.error) {
        setError(result.error);
      } else {
        toast.success("QR image removed");
        router.refresh();
        invalidateProfileQueries();
      }
    });
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
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-4 text-sm text-slate-500 hover:border-brand-400 hover:text-brand-600 transition-colors">
              <Upload size={16} />
              Choose file
              <input type="file" accept="image/*" onChange={handleQRUpload("gcash")} className="hidden" />
            </label>
            {initial?.gcash_qr_url && (
              <div className="mt-2 flex items-end gap-3">
                <img src={initial.gcash_qr_url} alt="GCash QR" className="h-32 w-32 object-contain rounded border" />
                <button
                  type="button"
                  onClick={() => handleQRRemove("gcash")}
                  className="text-sm font-medium text-red-600 hover:text-red-700"
                >
                  Remove GCash QR
                </button>
              </div>
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
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-4 text-sm text-slate-500 hover:border-brand-400 hover:text-brand-600 transition-colors">
              <Upload size={16} />
              Choose file
              <input type="file" accept="image/*" onChange={handleQRUpload("bank")} className="hidden" />
            </label>
            {initial?.bank_qr_url && (
              <div className="mt-2 flex items-end gap-3">
                <img src={initial.bank_qr_url} alt="Bank QR" className="h-32 w-32 object-contain rounded border" />
                <button
                  type="button"
                  onClick={() => handleQRRemove("bank")}
                  className="text-sm font-medium text-red-600 hover:text-red-700"
                >
                  Remove Bank QR
                </button>
              </div>
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

      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-700">Shared links</h3>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex items-start justify-between gap-4">
            <span>
              <span className="block text-sm font-medium text-slate-900">Show on shared group links</span>
              <span className="block text-xs text-slate-500">
                People who owe you money see these details on a group&apos;s shared page, so they can pay you
                without asking. Only shown while they owe you. You can hide them in any group.
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label="Show payment details on shared group links"
              aria-checked={showOnLinks}
              checked={showOnLinks}
              onChange={(e) => setShowOnLinks(e.target.checked)}
              className="mt-1 h-5 w-5 accent-emerald-600"
            />
          </label>
          <label className={`flex items-start justify-between gap-4 ${showOnLinks ? "" : "opacity-50"}`}>
            <span>
              <span className="block text-sm font-medium text-slate-900">Show full account numbers</span>
              <span className="block text-xs text-slate-500">
                Off: only the last 4 digits show (your QR code, if uploaded, still lets people pay). On: people
                can copy the full number.
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label="Show full account numbers on shared links"
              aria-checked={showOnLinks && fullNumbers}
              checked={showOnLinks && fullNumbers}
              disabled={!showOnLinks}
              onChange={(e) => setFullNumbers(e.target.checked)}
              className="mt-1 h-5 w-5 accent-emerald-600"
            />
          </label>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" isLoading={isPending} leftIcon={Save}>
        Save Payment Profile
      </Button>
    </form>
  );
}
