import { formatCents } from "@template/shared";
import { CopyButton } from "@/components/groups/CopyButton";
import type { FriendViewPayload } from "@template/shared";

type Props = {
  payload: FriendViewPayload;
  shareLink: string;
};

function buildMessage(payload: FriendViewPayload, link: string): string {
  const pp = payload.payment_profile;
  const owedAmount = payload.owed_cents ?? Math.max(0, -(payload.net_cents ?? 0));
  const lines: string[] = [
    owedAmount > 0
      ? `Hi ${payload.member.display_name}! You owe ${formatCents(owedAmount)} for ${payload.group.name}.`
      : `Hi ${payload.member.display_name}! You're all settled for ${payload.group.name}.`,
  ];

  if (pp?.gcash_number) {
    lines.push(`Pay via GCash: ${pp.gcash_number}${pp.gcash_name ? ` (${pp.gcash_name})` : ""}`);
  }
  if (pp?.bank_name && pp?.bank_account_number) {
    lines.push(
      `Or bank: ${pp.bank_name} ${pp.bank_account_number}${pp.bank_account_name ? ` (${pp.bank_account_name})` : ""}`,
    );
  }
  if (pp?.notes) lines.push(pp.notes);
  lines.push(`Link: ${link}`);

  return lines.join("\n");
}

export function FriendView({ payload, shareLink }: Props): React.ReactElement {
  const pp = payload.payment_profile;
  const message = buildMessage(payload, shareLink);
  const owedAmount = payload.owed_cents ?? Math.max(0, -(payload.net_cents ?? 0));
  const isPaid = owedAmount === 0;
  const isOwed = (payload.net_cents ?? 0) > 0;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-lg flex flex-col gap-6">
        {/* Header */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 text-center">
          <p className="text-slate-500 text-sm mb-2">{payload.group.name}</p>
          <h1 className="text-2xl font-bold text-slate-900">
            Hi {payload.member.display_name}!
          </h1>
          <p
            className={`mt-3 text-4xl font-extrabold ${
              isPaid ? "text-green-600" : isOwed ? "text-green-600" : "text-red-500"
            }`}
          >
            {isPaid
              ? "All Settled!"
              : isOwed
                ? `+${formatCents(payload.net_cents ?? 0)}`
                : formatCents(owedAmount)}
          </p>
          {!isPaid && (
            <p className="mt-1 text-sm text-slate-500">
              {isOwed ? "others owe you" : "remaining balance"}
            </p>
          )}
        </div>

        {/* Payment details */}
        {pp && !isPaid && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
            <h2 className="font-semibold text-slate-700">How to pay</h2>

            {(pp.gcash_name || pp.gcash_number) && (
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-slate-600">GCash</p>
                {pp.gcash_number && (
                  <p className="text-slate-900 font-mono">
                    {pp.gcash_number}
                    {pp.gcash_name && <span className="text-slate-500"> ({pp.gcash_name})</span>}
                    <CopyButton text={pp.gcash_number} label="Copy" className="ml-2" />
                  </p>
                )}
                {pp.gcash_qr_url && (
                  <img
                    src={pp.gcash_qr_url}
                    alt="GCash QR"
                    className="mt-2 h-48 w-48 object-contain rounded border"
                  />
                )}
              </div>
            )}

            {(pp.bank_name || pp.bank_account_number) && (
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-slate-600">
                  {pp.bank_name ?? "Bank Transfer"}
                </p>
                {pp.bank_account_number && (
                  <p className="text-slate-900 font-mono">
                    {pp.bank_account_number}
                    {pp.bank_account_name && (
                      <span className="text-slate-500"> ({pp.bank_account_name})</span>
                    )}
                    <CopyButton text={pp.bank_account_number} label="Copy" className="ml-2" />
                  </p>
                )}
                {pp.bank_qr_url && (
                  <img
                    src={pp.bank_qr_url}
                    alt="Bank QR"
                    className="mt-2 h-48 w-48 object-contain rounded border"
                  />
                )}
              </div>
            )}

            {pp.notes && <p className="text-sm text-slate-500 italic">{pp.notes}</p>}
          </div>
        )}

        {/* Expense breakdown */}
        {payload.expenses.length > 0 && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
            <h2 className="font-semibold text-slate-700 mb-3">Your expenses</h2>
            <div className="flex flex-col gap-2">
              {payload.expenses.map((exp, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-slate-700">{exp.item_name}</span>
                  <span className="font-medium text-slate-900">
                    {formatCents(exp.share_cents)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Copy message */}
        <div className="rounded-2xl bg-slate-100 border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Share this message
            </p>
            <CopyButton text={message} label="Copy message" />
          </div>
          <pre className="whitespace-pre-wrap text-xs text-slate-700 font-mono">{message}</pre>
        </div>
      </div>
    </div>
  );
}
