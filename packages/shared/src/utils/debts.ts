import type { CreditorPaymentProfile, SimplifiedDebt, SuggestedSettlement } from "../types";

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

type PairwiseExpenseInput = {
  payers?: { member_id: string; display_name: string; paid_cents: number }[];
  participants: { member_id?: string; display_name: string; share_cents: number }[];
};

type PairwisePaymentInput = {
  from_member_id: string;
  from_display_name: string;
  to_member_id: string;
  to_display_name: string;
  amount_cents: number;
};

/**
 * Compute the direct (un-simplified) pairwise debts: who owes whom based on
 * each individual expense, before netting into the minimal transfer set.
 *
 * For every expense, each participant's share is attributed to the payers in
 * proportion to what they paid (largest-remainder rounding so the shares add
 * up exactly). Recorded payments reduce the payer→payee debt, and opposite
 * directions between the same pair are netted so each pair appears at most
 * once. Expenses without payer data (or credits, which have no payers) are
 * skipped — this is a best-effort view, not the source of truth for balances.
 */
export function computePairwiseDebts(
  expenses: PairwiseExpenseInput[],
  payments: PairwisePaymentInput[],
): SimplifiedDebt[] {
  const owed = new Map<string, number>(); // "from|to" -> cents
  const names = new Map<string, string>();

  const add = (from: string, to: string, cents: number): void => {
    if (from === to || cents === 0) return;
    const key = `${from}|${to}`;
    owed.set(key, (owed.get(key) ?? 0) + cents);
  };

  for (const e of expenses) {
    const payers = e.payers ?? [];
    const totalPaid = payers.reduce((s, p) => s + p.paid_cents, 0);
    if (totalPaid <= 0) continue;
    for (const p of payers) names.set(p.member_id, p.display_name);

    for (const participant of e.participants) {
      if (!participant.member_id || participant.share_cents <= 0) continue;
      names.set(participant.member_id, participant.display_name);

      // Split this share across payers proportionally, largest remainder first
      const allocations = payers.map((payer) => {
        const raw = participant.share_cents * payer.paid_cents;
        return { payer, base: Math.floor(raw / totalPaid), remainder: raw % totalPaid };
      });
      let leftover = participant.share_cents - allocations.reduce((s, a) => s + a.base, 0);
      allocations.sort((a, b) => b.remainder - a.remainder);
      for (const alloc of allocations) {
        const extra = leftover > 0 ? 1 : 0;
        leftover -= extra;
        add(participant.member_id, alloc.payer.member_id, alloc.base + extra);
      }
    }
  }

  for (const p of payments) {
    names.set(p.from_member_id, p.from_display_name);
    names.set(p.to_member_id, p.to_display_name);
    add(p.from_member_id, p.to_member_id, -p.amount_cents);
  }

  // Net the two directions of each pair so each appears at most once
  const result: SimplifiedDebt[] = [];
  const seenPairs = new Set<string>();
  for (const key of owed.keys()) {
    const [from, to] = key.split("|") as [string, string];
    const pairKey = from < to ? `${from}|${to}` : `${to}|${from}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    const net = (owed.get(`${from}|${to}`) ?? 0) - (owed.get(`${to}|${from}`) ?? 0);
    if (net === 0) continue;
    const [debtor, creditor] = net > 0 ? [from, to] : [to, from];
    result.push({
      from_member_id: debtor,
      from_display_name: names.get(debtor) ?? "Unknown",
      to_member_id: creditor,
      to_display_name: names.get(creditor) ?? "Unknown",
      amount_cents: Math.abs(net),
    });
  }

  return result.sort(
    (a, b) => b.amount_cents - a.amount_cents || a.from_display_name.localeCompare(b.from_display_name),
  );
}

/**
 * Compute simplified debts and attach each creditor's payment profile.
 */
export function buildSuggestedSettlements(
  balances: BalanceInput[],
  creditorProfiles: CreditorPaymentProfile[],
): SuggestedSettlement[] {
  const debts = simplifyDebts(balances);
  const profileMap = new Map(creditorProfiles.map((p) => [p.member_id, p]));
  return debts.map((debt) => ({
    ...debt,
    creditor_profile: profileMap.get(debt.to_member_id) ?? null,
  }));
}
