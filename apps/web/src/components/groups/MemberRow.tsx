import type { GroupMember } from "@template/supabase";
import type { MemberBalance } from "@template/shared";
import { currencyOrPhp, formatCurrency } from "@/lib/currency";
import { CopyButton } from "./CopyButton";
import { track } from "@/lib/analytics/client";

function trackMemberLinkCopied(): void {
  track({ name: "public_link_copied", properties: { link_type: "member" } });
}

type Props = {
  member: GroupMember;
  balance: MemberBalance;
  groupName: string;
  paymentProfileText?: string;
  origin: string;
};

function buildMessage(
  member: GroupMember,
  balance: MemberBalance,
  groupName: string,
  paymentText: string,
  link: string,
): string {
  return [
    `Hi ${member.display_name}! You owe ${formatCurrency(balance.owed_cents, currencyOrPhp(balance.currency_code))} for ${groupName}.`,
    paymentText,
    `Link: ${link}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function MemberRow({
  member,
  balance,
  groupName,
  paymentProfileText = "",
  origin,
}: Props): React.ReactElement {
  const link = `${origin}/p/${member.share_token}`;
  const message = buildMessage(member, balance, groupName, paymentProfileText, link);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-900 truncate">{member.display_name}</p>
        <p
          className={`text-sm font-semibold ${balance.is_paid ? "text-green-600" : "text-red-500"}`}
        >
          {balance.is_paid ? "Paid" : formatCurrency(balance.owed_cents, currencyOrPhp(balance.currency_code))}
        </p>
      </div>
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          balance.is_paid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
        }`}
      >
        {balance.is_paid ? "Paid" : "Pending"}
      </span>
      <CopyButton text={link} label="Copy Link" onCopied={trackMemberLinkCopied} />
      <CopyButton text={message} label="Copy Msg" onCopied={trackMemberLinkCopied} />
    </div>
  );
}
