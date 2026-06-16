import { formatCents, buildSuggestedSettlements } from "@template/shared";
import { CopyButton } from "@/components/groups/CopyButton";
import { IvePaidButton } from "./IvePaidButton";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Receipt, CheckCircle2, TrendingDown, ArrowUpRight, Smartphone, Landmark } from "lucide-react";
import type { FriendViewPayload, CreditorPaymentProfile, SuggestedSettlement } from "@template/shared";

type Props = {
  payload: FriendViewPayload;
  shareLink: string;
  shareToken: string;
};

/**
 * Resolve the payment profile(s) to show for this member.
 * If creditor_profiles + all_balances are available, use simplifyDebts to find
 * who this member owes, and return those creditors' profiles.
 * Falls back to the owner's payment_profile for backward compat.
 */
function resolveCreditorProfiles(payload: FriendViewPayload): CreditorPaymentProfile[] {
  if (payload.all_balances?.length && payload.creditor_profiles?.length) {
    const settlements = buildSuggestedSettlements(payload.all_balances, payload.creditor_profiles);
    return settlements
      .filter((s) => s.from_member_id === payload.member.id && s.creditor_profile)
      .map((s) => s.creditor_profile!);
  }
  // Fallback: wrap owner payment_profile as a single creditor
  if (payload.payment_profile) {
    return [{
      member_id: "",
      display_name: payload.payment_profile.payer_display_name ?? "Group Owner",
      gcash_name: payload.payment_profile.gcash_name,
      gcash_number: payload.payment_profile.gcash_number,
      gcash_qr_url: payload.payment_profile.gcash_qr_url,
      bank_name: payload.payment_profile.bank_name,
      bank_account_name: payload.payment_profile.bank_account_name,
      bank_account_number: payload.payment_profile.bank_account_number,
      bank_qr_url: payload.payment_profile.bank_qr_url,
      notes: payload.payment_profile.notes,
    }];
  }
  return [];
}

function buildMessage(payload: FriendViewPayload, link: string): string {
  const profiles = resolveCreditorProfiles(payload);
  const owedAmount = payload.owed_cents ?? Math.max(0, -(payload.net_cents ?? 0));
  const lines: string[] = [
    owedAmount > 0
      ? `Hi ${payload.member.display_name}! You owe ${formatCents(owedAmount)} for ${payload.group.name}.`
      : `Hi ${payload.member.display_name}! You're all settled for ${payload.group.name}.`,
  ];

  for (const pp of profiles) {
    if (pp.display_name) lines.push(`Pay to: ${pp.display_name}`);
    if (pp.gcash_number) {
      lines.push(`GCash: ${pp.gcash_number}${pp.gcash_name ? ` (${pp.gcash_name})` : ""}`);
    }
    if (pp.bank_name && pp.bank_account_number) {
      lines.push(
        `Bank: ${pp.bank_name} ${pp.bank_account_number}${pp.bank_account_name ? ` (${pp.bank_account_name})` : ""}`,
      );
    }
    if (pp.notes) lines.push(pp.notes);
  }
  lines.push(`Link: ${link}`);

  return lines.join("\n");
}

function ProfilePaymentDetails({ pp }: { pp: CreditorPaymentProfile }): React.ReactElement {
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
    </>
  );
}

export function FriendView({ payload, shareLink, shareToken }: Props): React.ReactElement {
  const creditorProfiles = resolveCreditorProfiles(payload);
  const mySettlements: SuggestedSettlement[] =
    payload.all_balances?.length
      ? buildSuggestedSettlements(payload.all_balances, payload.creditor_profiles ?? []).filter(
          (s) => s.from_member_id === payload.member.id,
        )
      : [];
  const message = buildMessage(payload, shareLink);
  const owedAmount = payload.owed_cents ?? Math.max(0, -(payload.net_cents ?? 0));
  const isPaid = owedAmount === 0;
  const isOwed = (payload.net_cents ?? 0) > 0;
  const owes = !isPaid && !isOwed;

  const heroBg = owes
    ? "bg-gradient-to-br from-amber-500 to-orange-500"
    : isOwed
      ? "bg-gradient-to-br from-emerald-500 to-teal-500"
      : "bg-gradient-to-br from-brand-600 to-violet-600";

  const heroPill = owes
    ? { label: "You owe", icon: <TrendingDown size={13} className="text-white/80" /> }
    : isOwed
      ? { label: "You're owed", icon: <ArrowUpRight size={13} className="text-white/80" /> }
      : { label: "All settled", icon: <CheckCircle2 size={13} className="text-white/80" /> };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-lg flex flex-col gap-5 animate-fade-in">
        {/* Gradient Hero */}
        <div className={`${heroBg} rounded-2xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden`}>
          {/* Texture */}
          <div className="absolute inset-0 opacity-10 bg-dot-grid" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-white/80">{payload.group.name}</p>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20">
                {heroPill.icon}
                {heroPill.label}
              </span>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <Avatar name={payload.member.display_name} size="md" />
              <div>
                <p className="text-sm font-medium text-white/70">Hi {payload.member.display_name}</p>
                <p className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                  {isPaid ? "All Settled!" : formatCents(owedAmount)}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <CopyButton text={shareLink} label="Copy link" />
            </div>
          </div>
        </div>

        {/* Payment details — per settlement (with "I've paid" reporting) */}
        {owes && mySettlements.length > 0 && mySettlements.map((s) => (
          <Card key={s.to_member_id}>
            <CardHeader>
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Pay {s.to_display_name} · {formatCents(s.amount_cents)}
              </h2>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {s.creditor_profile ? (
                <ProfilePaymentDetails pp={s.creditor_profile} />
              ) : (
                <p className="text-sm text-slate-500">
                  {s.to_display_name} hasn&apos;t added payment details yet — ask them how they&apos;d like to be paid.
                </p>
              )}
              <IvePaidButton
                shareToken={shareToken}
                toMemberId={s.to_member_id}
                creditorName={s.to_display_name}
                suggestedAmountCents={s.amount_cents}
              />
            </CardContent>
          </Card>
        ))}

        {/* Fallback: owner payment profile only (no per-member settlements available) */}
        {owes && mySettlements.length === 0 && creditorProfiles.map((pp, idx) => (
          <Card key={pp.member_id || idx}>
            <CardHeader>
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {pp.display_name ? `Pay ${pp.display_name}` : "How to pay"}
              </h2>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ProfilePaymentDetails pp={pp} />
            </CardContent>
          </Card>
        ))}

        {/* Expense breakdown */}
        <Card>
          <CardHeader>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Your expenses</h2>
          </CardHeader>
          <CardContent>
            {payload.expenses.length > 0 ? (
              <div className="flex flex-col gap-2">
                {payload.expenses.map((exp, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-slate-100 px-3 py-2.5 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-700 font-medium">{exp.item_name}</span>
                      <span className="font-semibold text-slate-900">
                        {formatCents(exp.share_cents)}
                      </span>
                    </div>
                    {exp.category && (
                      <div className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: exp.category.color }} />
                        {exp.category.name}
                      </div>
                    )}
                    {exp.items && exp.items.length > 0 && (
                      <div className="mt-1.5 ml-3 border-l-2 border-brand-100 pl-3 flex flex-col gap-0.5">
                        {exp.items.map((item, j) => (
                          <div key={j} className="flex items-center justify-between text-xs text-slate-500">
                            <span>{item.name}</span>
                            <span>{formatCents(item.share_cents)}</span>
                          </div>
                        ))}
                      </div>
                    )}
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
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Share this message
              </p>
              <CopyButton text={message} label="Copy message" />
            </div>
            <pre className="whitespace-pre-wrap text-xs text-slate-700 font-mono">{message}</pre>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-slate-400">
          <div className="w-5 h-5 rounded bg-brand-600 flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">S</span>
          </div>
          <span>Powered by SettleUp</span>
        </div>
      </div>
    </div>
  );
}
