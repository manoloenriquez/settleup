"use client";

import { useState } from "react";
import { formatCents } from "@template/shared";
import { CopyButton } from "@/components/groups/CopyButton";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Smartphone, Landmark, ArrowRight, MessageCircle, Hash, ZoomIn, X } from "lucide-react";
import type { GroupOverviewPayload, SuggestedSettlement } from "@template/shared";

type Props = {
  groupName: string;
  settlements: SuggestedSettlement[];
  ownerProfile: GroupOverviewPayload["payment_profile"];
};

function isMasked(value: string): boolean {
  return value.includes("*");
}

function QrImage({ src, alt }: { src: string; alt: string }): React.ReactElement {
  const [zoomed, setZoomed] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setZoomed(true)}
        className="group relative mx-auto block"
        aria-label={`Enlarge ${alt}`}
      >
        <img
          src={src}
          alt={alt}
          className="w-full max-w-[220px] object-contain bg-white p-3 rounded-xl border border-slate-200 shadow-sm"
        />
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] text-white opacity-80 group-hover:opacity-100">
          <ZoomIn size={10} />
          Tap to enlarge
        </span>
      </button>
      {zoomed && (
        <button
          type="button"
          onClick={() => setZoomed(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 cursor-zoom-out"
          aria-label={`Close ${alt}`}
        >
          <span className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white">
            <X size={18} />
          </span>
          <img src={src} alt={alt} className="max-h-[85vh] w-full max-w-md object-contain bg-white p-4 rounded-2xl" />
        </button>
      )}
    </>
  );
}

function AccountLine({
  icon,
  methodLabel,
  accountNumber,
  accountName,
}: {
  icon: React.ReactNode;
  methodLabel: string;
  accountNumber: string;
  accountName: string | null;
}): React.ReactElement {
  const masked = isMasked(accountNumber);
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-slate-700">
          <span className="font-semibold">{methodLabel}</span>
          {masked ? <> · account ending in {accountNumber.replace(/\*/g, "")}</> : <> · <span className="font-mono">{accountNumber}</span></>}
          {accountName && <span className="text-slate-400"> — {accountName}</span>}
        </p>
      </div>
      {!masked && <CopyButton text={accountNumber} label="Copy" className="ml-auto shrink-0" />}
    </div>
  );
}

function PaymentReference({ groupName, payerName }: { groupName: string; payerName?: string }): React.ReactElement {
  const reference = payerName ? `${groupName} – ${payerName}` : groupName;
  return (
    <div className="flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1.5 text-xs">
      <Hash size={12} className="text-slate-400 shrink-0" />
      <span className="min-w-0 truncate text-slate-600">
        Payment reference: <span className="font-mono font-medium text-slate-800">{reference}</span>
      </span>
      <CopyButton text={reference} label="Copy" className="ml-auto shrink-0" />
    </div>
  );
}

export function OverviewSettleUpCard({ groupName, settlements, ownerProfile }: Props): React.ReactElement | null {
  if (settlements.length > 0) {
    return (
      <Card>
        <CardHeader>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Settle Up</h2>
          <p className="mt-1 text-xs text-slate-400 normal-case">
            The fewest payments that settle everyone. Find yours below and follow the steps.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {settlements.map((s, idx) => {
            const p = s.creditor_profile;
            return (
              <div key={idx} className="rounded-xl border border-slate-100 p-4">
                <p className="text-[11px] font-semibold text-brand-600 uppercase tracking-wide mb-2">
                  Step {idx + 1} of {settlements.length}
                </p>
                <div className="flex items-center gap-2 text-sm mb-3">
                  <Avatar name={s.from_display_name} size="sm" />
                  <span className="font-medium text-slate-700">{s.from_display_name}</span>
                  <ArrowRight size={14} className="text-slate-400" />
                  <Avatar name={s.to_display_name} size="sm" />
                  <span className="font-medium text-slate-700">{s.to_display_name}</span>
                  <span className="ml-auto font-bold text-slate-900">{formatCents(s.amount_cents)}</span>
                </div>

                {!p && (
                  <p className="text-xs text-slate-400 italic">
                    {s.to_display_name} hasn&apos;t added payment details yet — ask them how they&apos;d like to be paid.
                    (They can add details in Account &rarr; Payment Settings.)
                  </p>
                )}

                {p && (
                  <div className="flex flex-col gap-2.5 pl-2 border-l-2 border-brand-100">
                    {p.gcash_number && (
                      <AccountLine
                        icon={<Smartphone size={12} className="text-blue-500" />}
                        methodLabel="GCash"
                        accountNumber={p.gcash_number}
                        accountName={p.gcash_name}
                      />
                    )}
                    {p.gcash_qr_url && <QrImage src={p.gcash_qr_url} alt={`${s.to_display_name}'s GCash QR`} />}
                    {p.bank_name && p.bank_account_number && (
                      <AccountLine
                        icon={<Landmark size={12} className="text-brand-500" />}
                        methodLabel={p.bank_name}
                        accountNumber={p.bank_account_number}
                        accountName={p.bank_account_name}
                      />
                    )}
                    {p.bank_qr_url && <QrImage src={p.bank_qr_url} alt={`${s.to_display_name}'s bank QR`} />}
                    {(isMasked(p.gcash_number ?? "") || isMasked(p.bank_account_number ?? "")) && (
                      <p className="text-[11px] text-slate-400">
                        Account numbers are partially hidden for privacy — scan the QR to pay, or ask{" "}
                        {s.to_display_name} for the full number.
                      </p>
                    )}
                    {p.notes && <p className="text-xs text-slate-400 italic">{p.notes}</p>}
                    <PaymentReference groupName={groupName} payerName={s.from_display_name} />
                  </div>
                )}

                <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-400">
                  <MessageCircle size={12} className="mt-0.5 shrink-0" />
                  <span>
                    After paying, message {s.to_display_name} or the group owner so they can record it. If you were
                    sent a personal SettleUp link, use its &ldquo;I&apos;ve paid&rdquo; button instead.
                  </span>
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>
    );
  }

  const pp = ownerProfile;
  if (!pp || !(pp.gcash_number ?? pp.bank_account_number)) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">How to pay</h2>
          {pp.payer_display_name && (
            <div className="flex items-center gap-2">
              <Avatar name={pp.payer_display_name} size="sm" />
              <span className="text-sm font-medium text-slate-700">{pp.payer_display_name}</span>
            </div>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-400 normal-case">
          Send what you owe {pp.payer_display_name ? `to ${pp.payer_display_name}` : "to the group owner"} using any
          method below.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {pp.gcash_number && (
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 flex flex-col gap-2">
            <AccountLine
              icon={<Smartphone size={14} className="text-blue-500" />}
              methodLabel="GCash"
              accountNumber={pp.gcash_number}
              accountName={pp.gcash_name}
            />
            {pp.gcash_qr_url && <QrImage src={pp.gcash_qr_url} alt="GCash QR" />}
          </div>
        )}
        {pp.bank_name && pp.bank_account_number && (
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 flex flex-col gap-2">
            <AccountLine
              icon={<Landmark size={14} className="text-brand-500" />}
              methodLabel={pp.bank_name}
              accountNumber={pp.bank_account_number}
              accountName={pp.bank_account_name}
            />
            {pp.bank_qr_url && <QrImage src={pp.bank_qr_url} alt="Bank QR" />}
          </div>
        )}
        {(isMasked(pp.gcash_number ?? "") || isMasked(pp.bank_account_number ?? "")) && (
          <p className="text-[11px] text-slate-400">
            Account numbers are partially hidden for privacy — scan the QR to pay, or ask{" "}
            {pp.payer_display_name ?? "the group owner"} for the full number.
          </p>
        )}
        {pp.notes && <p className="text-xs text-slate-400 italic">{pp.notes}</p>}
        <PaymentReference groupName={groupName} />
        <p className="flex items-start gap-1.5 text-[11px] text-slate-400">
          <MessageCircle size={12} className="mt-0.5 shrink-0" />
          <span>
            Include your name in the payment reference, then message the group owner so they can record your payment.
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
