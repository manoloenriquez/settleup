"use client";

import { formatCents } from "@template/shared";
import { CopyButton } from "@/components/groups/CopyButton";
import type { GroupOverviewPayload } from "@template/shared";

type Props = {
  payload: GroupOverviewPayload;
};

function buildSummaryText(payload: GroupOverviewPayload): string {
  const pp = payload.payment_profile;
  const lines: string[] = [`GROUP SUMMARY — ${payload.group.name}`, "", "WHO OWES:"];

  for (const m of payload.members) {
    lines.push(m.owed_cents === 0 ? `${m.display_name} — Paid ✓` : `${m.display_name} — ${formatCents(m.owed_cents)}`);
  }

  const totalOwed = payload.members.reduce((sum, m) => sum + m.owed_cents, 0);
  lines.push("", `Total outstanding: ${formatCents(totalOwed)}`);

  if (pp) {
    if (pp.payer_display_name) lines.push("", `Pay to: ${pp.payer_display_name}`);
    if (pp.gcash_number) lines.push(`GCash: ${pp.gcash_number}`);
    if (pp.bank_name && pp.bank_account_number) {
      lines.push(`Bank: ${pp.bank_name} ${pp.bank_account_number}`);
    }
    if (pp.notes) lines.push(pp.notes);
  }

  if (payload.expenses.length > 0) {
    lines.push("", "EXPENSES:");
    for (const exp of payload.expenses) {
      const parts = exp.participants.map((p) => `${p.display_name} (${formatCents(p.share_cents)})`).join(", ");
      lines.push(`• ${exp.item_name} — ${formatCents(exp.amount_cents)}`);
      if (parts) lines.push(`  ${parts}`);
    }
  }

  return lines.join("\n");
}

export function GroupOverview({ payload }: Props): React.ReactElement {
  const pp = payload.payment_profile;
  const totalOwed = payload.members.reduce((sum, m) => sum + m.owed_cents, 0);
  const summaryText = buildSummaryText(payload);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-lg flex flex-col gap-6">
        {/* Header */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
          <h1 className="text-2xl font-bold text-slate-900">{payload.group.name}</h1>
          <p className="text-sm text-slate-500 mt-1">Expense Summary</p>
          <div className="mt-4 flex justify-end">
            <CopyButton text={summaryText} label="Copy Summary" />
          </div>
        </div>

        {/* Member balances */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
          <h2 className="font-semibold text-slate-700 mb-3">Who owes</h2>
          <div className="flex flex-col gap-2">
            {payload.members.map((m) => (
              <div key={m.member_id} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{m.display_name}</span>
                {m.owed_cents === 0 ? (
                  <span className="font-medium text-green-600">Paid ✓</span>
                ) : (
                  <span className="font-semibold text-red-500">{formatCents(m.owed_cents)}</span>
                )}
              </div>
            ))}
          </div>
          {totalOwed > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3 flex justify-between text-sm">
              <span className="font-medium text-slate-600">Total outstanding</span>
              <span className="font-bold text-slate-900">{formatCents(totalOwed)}</span>
            </div>
          )}
        </div>

        {/* Payment info */}
        {pp && (pp.gcash_number ?? pp.bank_account_number) && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 flex flex-col gap-3">
            <h2 className="font-semibold text-slate-700">How to pay</h2>
            {pp.payer_display_name && (
              <p className="text-sm text-slate-600">Pay to: <span className="font-medium text-slate-900">{pp.payer_display_name}</span></p>
            )}
            {pp.gcash_number && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-500">GCash:</span>
                <span className="font-mono text-slate-900">{pp.gcash_number}</span>
                {pp.gcash_name && <span className="text-slate-400">({pp.gcash_name})</span>}
                <CopyButton text={pp.gcash_number} label="Copy" className="ml-auto" />
              </div>
            )}
            {pp.bank_name && pp.bank_account_number && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-500">{pp.bank_name}:</span>
                <span className="font-mono text-slate-900">{pp.bank_account_number}</span>
                {pp.bank_account_name && <span className="text-slate-400">({pp.bank_account_name})</span>}
                <CopyButton text={pp.bank_account_number} label="Copy" className="ml-auto" />
              </div>
            )}
            {pp.notes && <p className="text-xs text-slate-400 italic">{pp.notes}</p>}
          </div>
        )}

        {/* Expense breakdown */}
        {payload.expenses.length > 0 && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
            <h2 className="font-semibold text-slate-700 mb-3">Expenses</h2>
            <div className="flex flex-col gap-4">
              {payload.expenses.map((exp, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-800">
                      {exp.item_name}
                      {exp.amount_cents < 0 && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          Credit
                        </span>
                      )}
                    </span>
                    <span className={`font-semibold ${exp.amount_cents < 0 ? "text-green-600" : "text-slate-700"}`}>
                      {formatCents(exp.amount_cents)}
                    </span>
                  </div>
                  {exp.participants.length > 0 && (
                    <p className="mt-1 text-xs text-slate-400">
                      {exp.participants.map((p) => `${p.display_name} (${formatCents(p.share_cents)})`).join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
