/**
 * One line under a group expense saying who paid and where you stand on it,
 * e.g. "You paid · you lent ₱200.00" or "Carla paid · your share ₱450.00", so
 * a wrong payer or split is visible in the list without opening the expense.
 */
export type ExpenseStake = {
  paidBy: string;
  /** Your part: positive = others owe you for it, negative = your share, 0/null = not involved. */
  tone: "lent" | "share" | "none";
  amountMinor: number;
};

export function expenseStake(
  payers: ReadonlyArray<{ member_id: string; paid_cents: number }>,
  participants: ReadonlyArray<{ member_id: string; share_cents: number }>,
  myMemberId: string | null,
  nameOf: (memberId: string) => string,
): ExpenseStake {
  const paying = payers.filter((p) => p.paid_cents > 0);
  const first = paying[0];
  const paidBy =
    paying.length > 1
      ? `${paying.length} people paid`
      : first
        ? `${first.member_id === myMemberId ? "You" : nameOf(first.member_id)} paid`
        : "Paid";
  if (!myMemberId) return { paidBy, tone: "none", amountMinor: 0 };
  const paid = paying.filter((p) => p.member_id === myMemberId).reduce((s, p) => s + p.paid_cents, 0);
  const share = participants.filter((p) => p.member_id === myMemberId).reduce((s, p) => s + p.share_cents, 0);
  if (paid === 0 && share === 0) return { paidBy, tone: "none", amountMinor: 0 };
  const net = paid - share;
  // Paid exactly your own part: nothing to say beyond who paid.
  if (net === 0) return { paidBy, tone: "none", amountMinor: 0 };
  if (net > 0) return { paidBy, tone: "lent", amountMinor: net };
  return { paidBy, tone: "share", amountMinor: share - paid };
}
