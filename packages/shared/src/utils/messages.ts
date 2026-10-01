import { formatCents } from "./money";
import { formatAmount } from "./amount";
import type { CurrencyCode } from "./currency";

export type NudgeMessageInput = {
  debtorName: string;
  creditorName: string;
  amountCents: number;
  groupName: string;
  link?: string | null;
  /** Currency of the amount; pesos when omitted (older callers). */
  currency?: CurrencyCode;
};

/**
 * Friendly payment-reminder message for sharing to a debtor, with their
 * personal balance link when available.
 */
export function buildNudgeMessage(input: NudgeMessageInput): string {
  const lines = [
    `Hi ${input.debtorName}! Friendly reminder from ${input.groupName}: you owe ${input.creditorName} ${input.currency ? formatAmount(input.amountCents, input.currency) : formatCents(input.amountCents)}.`,
  ];
  if (input.link) {
    lines.push(`View details & pay here: ${input.link}`);
  }
  return lines.join("\n");
}
