import { formatCents } from "@template/shared";
import { CopyButton } from "@/components/groups/CopyButton";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Receipt, CheckCircle, Smartphone, Landmark } from "lucide-react";
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
      <div className="mx-auto max-w-lg flex flex-col gap-6 animate-fade-in">
        {/* Header */}
        <Card>
          <CardContent className="py-6 text-center">
            <div className="flex justify-center mb-3">
              <Avatar name={payload.member.display_name} size="lg" />
            </div>
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
            {isPaid ? (
              <div className="mt-2 flex justify-center">
                <Badge variant="success">
                  <CheckCircle size={12} className="mr-1" />
                  Settled
                </Badge>
              </div>
            ) : (
              <div className="mt-2 flex justify-center">
                <Badge variant={isOwed ? "success" : "danger"}>
                  {isOwed ? "others owe you" : "remaining balance"}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment details */}
        {pp && !isPaid && !isOwed && (
          <Card>
            <CardHeader>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">How to pay</h2>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {(pp.gcash_name || pp.gcash_number) && (
                <div className="rounded-lg bg-slate-50 border border-slate-100 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Smartphone size={16} className="text-blue-500" />
                    <span className="text-sm font-semibold text-slate-700">GCash</span>
                  </div>
                  {pp.gcash_number && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-slate-900">{pp.gcash_number}</span>
                      {pp.gcash_name && <span className="text-slate-400">({pp.gcash_name})</span>}
                      <CopyButton text={pp.gcash_number} label="Copy" className="ml-auto" />
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
                <div className="rounded-lg bg-slate-50 border border-slate-100 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Landmark size={16} className="text-indigo-500" />
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
                      <CopyButton text={pp.bank_account_number} label="Copy" className="ml-auto" />
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
            </CardContent>
          </Card>
        )}

        {/* Expense breakdown */}
        <Card>
          <CardHeader>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Your expenses</h2>
          </CardHeader>
          <CardContent>
            {payload.expenses.length > 0 ? (
              <div className="flex flex-col gap-2">
                {payload.expenses.map((exp, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-sm rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <span className="text-slate-700">{exp.item_name}</span>
                    <span className="font-medium text-slate-900">
                      {formatCents(exp.share_cents)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Receipt} title="No expenses yet" description="Your expenses will appear here." />
            )}
          </CardContent>
        </Card>

        {/* Copy message */}
        <Card className="bg-slate-50">
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Share this message
              </p>
              <CopyButton text={message} label="Copy message" />
            </div>
            <pre className="whitespace-pre-wrap text-xs text-slate-700 font-mono">{message}</pre>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 py-2">Powered by SettleUp</p>
      </div>
    </div>
  );
}
