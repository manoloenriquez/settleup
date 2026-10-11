import type { CurrencyCode } from "./currency";
import type { DashboardSummary, GroupWithStats } from "../types";

// ---------------------------------------------------------------------------
// Combining per-currency RPC results without double counting.
//
// Each *_v2 call returns every group the caller belongs to, with amounts in
// the requested currency only. Results for different currencies must never be
// added together; they are kept side by side.
// ---------------------------------------------------------------------------

export type CurrencyAmount = { currency: CurrencyCode; amountMinor: number };

/**
 * One row per group from several get_groups_with_stats_v2 calls: the row for
 * the group's own default currency (its stats are in that currency).
 */
export function groupRowsInDefaultCurrency(
  results: { currency: CurrencyCode; rows: GroupWithStats[] }[],
): GroupWithStats[] {
  const chosen = new Map<string, GroupWithStats>();
  const fallback = new Map<string, GroupWithStats>();
  for (const { currency, rows } of results) {
    for (const row of rows) {
      const defaultCurrency = row.default_currency_code ?? "PHP";
      if (currency === defaultCurrency) chosen.set(row.id, { ...row, default_currency_code: defaultCurrency });
      else if (!fallback.has(row.id)) fallback.set(row.id, row);
    }
  }
  // A group whose default currency was not requested still appears once,
  // with its stats zeroed rather than shown in the wrong currency.
  for (const [id, row] of fallback) {
    if (!chosen.has(id)) chosen.set(id, { ...row, member_count: row.member_count, pending_count: 0, total_owed_cents: 0 });
  }
  const order = results[0]?.rows.map((row) => row.id) ?? [];
  return [...chosen.values()].sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    if (ai === -1 || bi === -1) return b.created_at.localeCompare(a.created_at);
    return ai - bi;
  });
}

/** My net position per currency, dropping currencies where nobody owes anything. */
export function nonZeroNets(summaries: DashboardSummary[]): CurrencyAmount[] {
  return summaries
    .filter((summary) => summary.currency_code && summary.net_balance_cents !== 0)
    .map((summary) => ({ currency: summary.currency_code as CurrencyCode, amountMinor: summary.net_balance_cents }));
}

/** Per group, my net in each currency that is not zero. */
export function groupNetsByCurrency(summaries: DashboardSummary[]): Map<string, CurrencyAmount[]> {
  const byGroup = new Map<string, CurrencyAmount[]>();
  for (const summary of summaries) {
    if (!summary.currency_code) continue;
    for (const group of summary.groups) {
      if (group.my_net_cents === 0) continue;
      const list = byGroup.get(group.id) ?? [];
      list.push({ currency: summary.currency_code, amountMinor: group.my_net_cents });
      byGroup.set(group.id, list);
    }
  }
  return byGroup;
}

/** Totals owed to me and by me, per currency (each side never mixes currencies). */
export function owedTotalsByCurrency(
  summaries: DashboardSummary[],
): { currency: CurrencyCode; owedToMe: number; iOwe: number; owedFrom: number; oweTo: number }[] {
  return summaries
    .filter((summary) => summary.currency_code && (summary.owed_to_me_cents !== 0 || summary.i_owe_cents !== 0))
    .map((summary) => ({
      currency: summary.currency_code as CurrencyCode,
      owedToMe: summary.owed_to_me_cents,
      iOwe: summary.i_owe_cents,
      owedFrom: summary.owed_counterparty_count,
      oweTo: summary.owe_counterparty_count,
    }));
}
