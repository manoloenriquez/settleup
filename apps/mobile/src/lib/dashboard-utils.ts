export function aggregateBalances(
  balances: { net_cents: number }[],
): { total_owed_cents: number; total_receivable_cents: number; net_cents: number } {
  let total_owed_cents = 0;
  let total_receivable_cents = 0;

  for (const b of balances) {
    if (b.net_cents > 0) total_receivable_cents += b.net_cents;
    else total_owed_cents += Math.abs(b.net_cents);
  }

  return {
    total_owed_cents,
    total_receivable_cents,
    net_cents: total_receivable_cents - total_owed_cents,
  };
}
