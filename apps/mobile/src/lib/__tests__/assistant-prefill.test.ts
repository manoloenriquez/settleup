import { describe, expect, it } from "vitest";
import { editRouteFor, parseGroupPrefill, parsePersonalPrefill } from "../assistant/prefill";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("Edit on an Assistant preview", () => {
  it("opens the personal form with the preview's values", () => {
    const route = editRouteFor({ type: "add_personal_expense", description: "Coffee", amountMinor: 18000, currency: "PHP", date: "2026-10-09", category: "food-drinks" });
    expect(route?.pathname).toBe("/(protected)/expense/new");
    expect(parsePersonalPrefill(route && "prefill" in route.params ? route.params.prefill : null)).toEqual({ amountMinor: 18000, currency: "PHP", description: "Coffee", date: "2026-10-09", category: "food-drinks" });
  });

  it("opens the group form; non-equal splits keep exact amounts", () => {
    const route = editRouteFor({
      type: "add_group_expense",
      groupId: "g1",
      description: "Dinner",
      amountMinor: 100000,
      currency: "PHP",
      date: "2026-10-09",
      payerMemberId: A,
      splitMode: "exact",
      shares: [
        { memberId: A, shareCents: 60000 },
        { memberId: B, shareCents: 40000 },
      ],
    });
    expect(route?.pathname).toBe("/(protected)/groups/[id]/add-expense");
    const prefill = parseGroupPrefill(route && "prefill" in route.params ? route.params.prefill : null);
    expect(prefill).toMatchObject({ equal: false, payerMemberId: A, shares: [{ memberId: A, shareCents: 60000 }, { memberId: B, shareCents: 40000 }] });
  });

  it("opens Record a Payment for a payment", () => {
    const route = editRouteFor({ type: "record_payment", groupId: "g1", fromMemberId: A, toMemberId: B, amountMinor: 45000, currency: "PHP" });
    expect(route).toMatchObject({ pathname: "/(protected)/groups/[id]/settle-up", params: { id: "g1", fromId: A, toId: B, amount: "45000", currency: "PHP" } });
  });

  it("has no form for deletes and member changes", () => {
    expect(editRouteFor({ type: "delete_personal_expense", expenseId: "x", expectedUpdatedAt: "t" })).toBeNull();
  });

  it("rejects tampered or malformed params", () => {
    expect(parsePersonalPrefill("{not json")).toBeNull();
    expect(parsePersonalPrefill(JSON.stringify({ amountMinor: -5, currency: "PHP", description: "x", date: "2026-10-09", category: "food-drinks" }))).toBeNull();
    expect(parsePersonalPrefill(JSON.stringify({ amountMinor: 5, currency: "XXX", description: "x", date: "2026-10-09", category: "food-drinks" }))).toBeNull();
    expect(parseGroupPrefill(undefined)).toBeNull();
  });
});

describe("Edit on a personal change preview", () => {
  it("opens the expense's own form with the change filled in", () => {
    const route = editRouteFor({
      type: "edit_personal_expense",
      expenseId: "p-coffee",
      expectedUpdatedAt: "t",
      description: "Coffee",
      amountMinor: 22000,
      currency: "PHP",
      date: "2026-10-03",
      category: "food-drinks",
    });
    expect(route).toMatchObject({ pathname: "/(protected)/expense/[id]", params: { id: "p-coffee" } });
    expect(parsePersonalPrefill(route && "prefill" in route.params ? route.params.prefill : null)?.amountMinor).toBe(22000);
  });
});
