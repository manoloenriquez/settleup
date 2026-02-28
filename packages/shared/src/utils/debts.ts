import type { SimplifiedDebt } from "../types";

type BalanceInput = {
  member_id: string;
  display_name: string;
  net_cents: number;
};

/**
 * Compute the minimum set of pairwise transfers to settle all group debts.
 *
 * Greedy algorithm: repeatedly match the largest debtor with the largest
 * creditor, transferring `min(debt, credit)` until all balances are zero.
 *
 * @param balances - Array of members with their net_cents (negative = owes, positive = is owed)
 * @returns Minimal list of transfers to settle all debts
 */
export function simplifyDebts(balances: BalanceInput[]): SimplifiedDebt[] {
  // Build mutable lists of debtors (net < 0) and creditors (net > 0)
  const debtors: { member_id: string; display_name: string; amount: number }[] = [];
  const creditors: { member_id: string; display_name: string; amount: number }[] = [];

  for (const b of balances) {
    if (b.net_cents < 0) {
      debtors.push({ member_id: b.member_id, display_name: b.display_name, amount: -b.net_cents });
    } else if (b.net_cents > 0) {
      creditors.push({ member_id: b.member_id, display_name: b.display_name, amount: b.net_cents });
    }
  }

  // Sort descending by amount so we greedily match largest first
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const result: SimplifiedDebt[] = [];
  let di = 0;
  let ci = 0;

  while (di < debtors.length && ci < creditors.length) {
    const debtor = debtors[di]!;
    const creditor = creditors[ci]!;
    const transfer = Math.min(debtor.amount, creditor.amount);

    if (transfer > 0) {
      result.push({
        from_member_id: debtor.member_id,
        from_display_name: debtor.display_name,
        to_member_id: creditor.member_id,
        to_display_name: creditor.display_name,
        amount_cents: transfer,
      });
    }

    debtor.amount -= transfer;
    creditor.amount -= transfer;

    if (debtor.amount === 0) di++;
    if (creditor.amount === 0) ci++;
  }

  return result;
}
