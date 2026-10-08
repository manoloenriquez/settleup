"use client";

import { CopyButton } from "@/components/groups/CopyButton";
import { trackPublicEvent } from "@/app/actions/analytics";
import { Smartphone, Landmark } from "lucide-react";
import type { CreditorPaymentProfile } from "@template/shared";

export function ProfilePaymentDetails({
  pp,
  shareToken,
}: {
  pp: CreditorPaymentProfile;
  shareToken: string;
}): React.ReactElement {
  const onCopied = (): void => {
    void trackPublicEvent({
      share_token: shareToken,
      name: "payment_details_actioned",
      properties: { action: "copy" },
    });
  };
  return (
    <>
      {(pp.gcash_name || pp.gcash_number) && (
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Smartphone size={16} className="text-blue-500" />
            <span className="text-sm font-semibold text-slate-700">GCash</span>
          </div>
          {pp.gcash_number && (
            <div className="flex items-center gap-2 text-sm">
              <span className="font-mono text-slate-900">{pp.gcash_number}</span>
              {pp.gcash_name && <span className="text-slate-400">({pp.gcash_name})</span>}
              <CopyButton text={pp.gcash_number} label="Copy" className="ml-auto" onCopied={onCopied} />
            </div>
          )}
          {pp.gcash_qr_url && (
            <div className="mt-3 flex justify-center">
              <img
                src={pp.gcash_qr_url}
                alt="GCash QR"
                className="w-full max-w-[280px] object-contain bg-white p-4 rounded-xl border border-slate-200 shadow-sm"
              />
            </div>
          )}
        </div>
      )}

      {(pp.bank_name || pp.bank_account_number) && (
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Landmark size={16} className="text-brand-500" />
            <span className="text-sm font-semibold text-slate-700">
              {pp.bank_name ?? "Bank Transfer"}
            </span>
          </div>
          {pp.bank_account_number && (
            <div className="flex items-center gap-2 text-sm">
              <span className="font-mono text-slate-900">{pp.bank_account_number}</span>
              {pp.bank_account_name && (
                <span className="text-slate-400">({pp.bank_account_name})</span>
              )}
              <CopyButton
                text={pp.bank_account_number}
                label="Copy"
                className="ml-auto"
                onCopied={onCopied}
              />
            </div>
          )}
          {pp.bank_qr_url && (
            <div className="mt-3 flex justify-center">
              <img
                src={pp.bank_qr_url}
                alt="Bank QR"
                className="w-full max-w-[280px] object-contain bg-white p-4 rounded-xl border border-slate-200 shadow-sm"
              />
            </div>
          )}
        </div>
      )}

      {pp.notes && <p className="text-sm text-slate-500 italic">{pp.notes}</p>}
    </>
  );
}
