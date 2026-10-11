"use client";

import { CopyButton } from "@/components/groups/CopyButton";
import { trackPublicEvent } from "@/app/actions/analytics";
import { isMaskedNumber, maskedNumberLabel, organizerNote } from "@/lib/payment-display";
import { Smartphone, Landmark } from "lucide-react";
import type { CreditorPaymentProfile } from "@template/shared";

function NumberLine({
  number,
  name,
  onCopied,
}: {
  number: string;
  name: string | null;
  onCopied: () => void;
}): React.ReactElement {
  const masked = isMaskedNumber(number);
  return (
    <div className="flex items-center gap-2 text-sm">
      {masked ? (
        <span className="text-slate-700">{maskedNumberLabel(number)}</span>
      ) : (
        <span className="font-mono text-slate-900">{number}</span>
      )}
      {name && <span className="text-slate-500">({name})</span>}
      {!masked && <CopyButton text={number} label="Copy" className="ml-auto" onCopied={onCopied} />}
    </div>
  );
}

export function ProfilePaymentDetails({
  pp,
  shareToken,
  ownerName,
}: {
  pp: CreditorPaymentProfile;
  shareToken: string;
  /** Who is being paid; names the person in the masked-number and organizer notes. */
  ownerName: string;
}): React.ReactElement {
  const onCopied = (): void => {
    void trackPublicEvent({
      share_token: shareToken,
      name: "payment_details_actioned",
      properties: { action: "copy" },
    });
  };
  const anyMasked =
    isMaskedNumber(pp.gcash_number ?? "") || isMaskedNumber(pp.bank_account_number ?? "");
  const unconfirmed = organizerNote(pp.source, ownerName);
  return (
    <>
      {unconfirmed && (
        <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
          {unconfirmed}
        </p>
      )}
      {(pp.gcash_name || pp.gcash_number) && (
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Smartphone size={16} className="text-blue-500" />
            <span className="text-sm font-semibold text-slate-700">GCash</span>
          </div>
          {pp.gcash_number && (
            <NumberLine number={pp.gcash_number} name={pp.gcash_name} onCopied={onCopied} />
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
            <NumberLine
              number={pp.bank_account_number}
              name={pp.bank_account_name}
              onCopied={onCopied}
            />
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

      {anyMasked && (
        <p className="text-sm text-slate-500">
          Account numbers are partly hidden for privacy. Scan the QR code to pay, or ask {ownerName}{" "}
          for the full number.
        </p>
      )}

      {pp.notes && <p className="text-sm text-slate-500 italic">{pp.notes}</p>}
    </>
  );
}
