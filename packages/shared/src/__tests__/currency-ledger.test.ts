import { describe, expect, it } from "vitest";
import { groupNetsByCurrency, groupRowsInDefaultCurrency, nonZeroNets, owedTotalsByCurrency } from "../utils/currency-ledger";
import type { DashboardSummary, GroupWithStats } from "../types";

const group = (id: string, currency: "PHP" | "JPY", owed: number, created = "2026-09-01"): GroupWithStats => ({
  id, name: id, owner_user_id: null, invite_code: "x", is_archived: false, share_token: "t", budget_cents: null,
  created_at: created, default_currency_code: currency, member_count: 3, pending_count: owed > 0 ? 1 : 0, total_owed_cents: owed,
});

describe("groupRowsInDefaultCurrency", () => {
  it("takes each group's stats from its own currency and never duplicates", () => {
    const rows = groupRowsInDefaultCurrency([
      { currency: "PHP", rows: [group("manila", "PHP", 120000, "2026-09-02"), group("tokyo", "JPY", 0, "2026-09-01")] },
      { currency: "JPY", rows: [group("manila", "PHP", 0, "2026-09-02"), group("tokyo", "JPY", 4500, "2026-09-01")] },
    ]);
    expect(rows.map((r) => [r.id, r.total_owed_cents])).toEqual([["manila", 120000], ["tokyo", 4500]]);
  });

  it("zeroes stats for a group whose currency was not requested", () => {
    const rows = groupRowsInDefaultCurrency([{ currency: "PHP", rows: [group("tokyo", "JPY", 999)] }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.total_owed_cents).toBe(0);
  });
});

const summary = (currency: "PHP" | "USD", net: number, groups: [string, number][]): DashboardSummary => ({
  currency_code: currency, net_balance_cents: net, total_groups: groups.length, total_unsettled_cents: 0, pending_members: 0,
  owed_to_me_cents: Math.max(0, net), i_owe_cents: Math.max(0, -net), owed_counterparty_count: net > 0 ? 1 : 0,
  owe_counterparty_count: net < 0 ? 1 : 0, spend_series: [],
  groups: groups.map(([id, my]) => ({ id, name: id, member_count: 2, pending_count: 0, total_owed_cents: 0, my_net_cents: my, created_at: "2026-09-01" })),
});

describe("dashboard per currency", () => {
  const summaries = [summary("PHP", 100000, [["manila", 100000], ["tokyo", 0]]), summary("USD", -1500, [["manila", 0], ["tokyo", -1500]])];
  it("keeps currencies apart", () => {
    expect(nonZeroNets(summaries)).toEqual([{ currency: "PHP", amountMinor: 100000 }, { currency: "USD", amountMinor: -1500 }]);
    expect(groupNetsByCurrency(summaries).get("tokyo")).toEqual([{ currency: "USD", amountMinor: -1500 }]);
    expect(owedTotalsByCurrency(summaries)).toEqual([
      { currency: "PHP", owedToMe: 100000, iOwe: 0, owedFrom: 1, oweTo: 0 },
      { currency: "USD", owedToMe: 0, iOwe: 1500, owedFrom: 0, oweTo: 1 },
    ]);
  });
});
