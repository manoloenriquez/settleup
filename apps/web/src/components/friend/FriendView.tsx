import { buildSuggestedSettlements, currencyName } from "@template/shared";
import { CopyButton } from "@/components/groups/CopyButton";
import { ProfilePaymentDetails } from "./ProfilePaymentDetails";
import { IvePaidButton } from "./IvePaidButton";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, SEPARATE_CURRENCIES_NOTE } from "@/lib/currency";
import {
  Receipt,
  CheckCircle2,
  TrendingDown,
  ArrowUpRight,
} from "lucide-react";
import type {
  CurrencyCode,
  FriendViewPayload,
  CreditorPaymentProfile,
  SuggestedSettlement,
} from "@template/shared";

/** A member's shared-page payload for one currency; every amount is in `currency`. */
export type CurrencyFriendView = {
  currency: CurrencyCode;
  payload: FriendViewPayload;
};

type Props = {
  /** One entry per currency the group uses, default currency first. */
  views: CurrencyFriendView[];
  shareLink: string;
  shareToken: string;
};

type Standing = "owes" | "owed" | "settled";

/** What this member owes in one currency (never summed across currencies). */
function owedIn(payload: FriendViewPayload): number {
  return payload.owed_cents ?? Math.max(0, -(payload.net_cents ?? 0));
}

function standingIn(payload: FriendViewPayload): Standing {
  if (owedIn(payload) > 0) return "owes";
  return (payload.net_cents ?? 0) > 0 ? "owed" : "settled";
}

function joinWithAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

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
    return [
      {
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
      },
    ];
  }
  return [];
}

function profileKey(pp: CreditorPaymentProfile): string {
  return [
    pp.member_id,
    pp.display_name,
    pp.gcash_number,
    pp.bank_name,
    pp.bank_account_number,
    pp.notes,
  ].join("|");
}

function buildMessage(views: CurrencyFriendView[], link: string): string {
  const first = views[0]?.payload;
  const memberName = first?.member.display_name ?? "";
  const groupName = first?.group.name ?? "";
  const owedParts = views
    .filter(({ payload }) => owedIn(payload) > 0)
    .map(({ currency, payload }) => formatCurrency(owedIn(payload), currency));
  const lines: string[] = [
    owedParts.length > 0
      ? `Hi ${memberName}! You owe ${joinWithAnd(owedParts)} for ${groupName}.`
      : `Hi ${memberName}! You're all settled for ${groupName}.`,
  ];
  if (owedParts.length > 1) lines.push(SEPARATE_CURRENCIES_NOTE);

  const seen = new Set<string>();
  for (const { payload } of views) {
    for (const pp of resolveCreditorProfiles(payload)) {
      const key = profileKey(pp);
      if (seen.has(key)) continue;
      seen.add(key);
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
  }
  lines.push(`Link: ${link}`);

  return lines.join("\n");
}

function CurrencySection({
  view,
  shareToken,
}: {
  view: CurrencyFriendView;
  shareToken: string;
}): React.ReactElement {
  const { currency, payload } = view;
  const creditorProfiles = resolveCreditorProfiles(payload);
  const mySettlements: SuggestedSettlement[] = payload.all_balances?.length
    ? buildSuggestedSettlements(payload.all_balances, payload.creditor_profiles ?? []).filter(
        (s) => s.from_member_id === payload.member.id,
      )
    : [];
  const standing = standingIn(payload);
  const owes = standing === "owes";
  const headingId = `amounts-${currency}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div>
        <h2
          id={headingId}
          className="flex items-center gap-2 text-sm font-bold text-slate-700 tracking-tight"
        >
          <span className="rounded-md bg-brand-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
            {currency}
          </span>
          Amounts in {currency} · {currencyName(currency)}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {standing === "owes"
            ? `You owe ${formatCurrency(owedIn(payload), currency)}`
            : standing === "owed"
              ? `You're owed ${formatCurrency(payload.net_cents, currency)}`
              : "You're settled"}
        </p>
      </div>

      {/* Payment details — per settlement (with "I've paid" reporting) */}
      {owes &&
        mySettlements.length > 0 &&
        mySettlements.map((s) => (
          <Card key={s.to_member_id}>
            <CardHeader>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Pay {s.to_display_name} · {formatCurrency(s.amount_cents, currency)}
              </h3>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {s.creditor_profile ? (
                <ProfilePaymentDetails shareToken={shareToken} pp={s.creditor_profile} />
              ) : (
                <p className="text-sm text-slate-500">
                  {s.to_display_name} hasn&apos;t added payment details yet — ask them how
                  they&apos;d like to be paid.
                </p>
              )}
              <IvePaidButton
                shareToken={shareToken}
                toMemberId={s.to_member_id}
                creditorName={s.to_display_name}
                suggestedAmountCents={s.amount_cents}
                currency={currency}
              />
            </CardContent>
          </Card>
        ))}

      {/* Fallback: owner payment profile only (no per-member settlements available) */}
      {owes &&
        mySettlements.length === 0 &&
        creditorProfiles.map((pp, idx) => (
          <Card key={pp.member_id || idx}>
            <CardHeader>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {pp.display_name ? `Pay ${pp.display_name}` : "How to pay"}
              </h3>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ProfilePaymentDetails shareToken={shareToken} pp={pp} />
            </CardContent>
          </Card>
        ))}

      {/* Expense breakdown */}
      <Card>
        <CardHeader>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Your expenses
          </h3>
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
                      {formatCurrency(exp.share_cents, currency)}
                    </span>
                  </div>
                  {exp.category && (
                    <div className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: exp.category.color }}
                      />
                      {exp.category.name}
                    </div>
                  )}
                  {exp.items && exp.items.length > 0 && (
                    <div className="mt-1.5 ml-3 border-l-2 border-brand-100 pl-3 flex flex-col gap-0.5">
                      {exp.items.map((item, j) => (
                        <div
                          key={j}
                          className="flex items-center justify-between text-xs text-slate-500"
                        >
                          <span>{item.name}</span>
                          <span>{formatCurrency(item.share_cents, currency)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Receipt}
              title="No expenses yet"
              description="Your expenses will appear here."
            />
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export function FriendView({ views, shareLink, shareToken }: Props): React.ReactElement {
  const first = views[0]?.payload;
  const memberName = first?.member.display_name ?? "";
  const groupName = first?.group.name ?? "";
  const message = buildMessage(views, shareLink);
  const owing = views.filter(({ payload }) => standingIn(payload) === "owes");
  const owes = owing.length > 0;
  const isOwed = !owes && views.some(({ payload }) => standingIn(payload) === "owed");
  const isPaid = !owes;

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
        <div
          className={`${heroBg} rounded-2xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden`}
        >
          {/* Texture */}
          <div className="absolute inset-0 opacity-10 bg-dot-grid" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-white/80">{groupName}</p>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20">
                {heroPill.icon}
                {heroPill.label}
              </span>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <Avatar name={memberName} size="md" />
              <div>
                <p className="text-sm font-medium text-white/70">Hi {memberName}</p>
                {isPaid ? (
                  <p className="text-3xl sm:text-4xl font-extrabold tracking-tight">All Settled!</p>
                ) : (
                  owing.map(({ currency, payload }) => (
                    <p
                      key={currency}
                      className={`${owing.length > 1 ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"} font-extrabold tracking-tight`}
                    >
                      {formatCurrency(owedIn(payload), currency)}
                    </p>
                  ))
                )}
              </div>
            </div>
            {views.length > 1 && (
              <p className="mt-2 text-xs text-white/70">{SEPARATE_CURRENCIES_NOTE}</p>
            )}
            <div className="mt-4">
              <CopyButton text={shareLink} label="Copy link" />
            </div>
          </div>
        </div>

        {views.map((view) => (
          <CurrencySection key={view.currency} view={view} shareToken={shareToken} />
        ))}

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
            <span className="text-white text-[10px] font-bold">T</span>
          </div>
          <span>Powered by Talli</span>
        </div>
      </div>
    </div>
  );
}
