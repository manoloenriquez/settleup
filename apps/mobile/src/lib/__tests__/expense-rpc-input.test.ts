import { describe, expect, it } from "vitest";
import {
  buildCustomExpenseRpcInput,
  buildEqualExpenseRpcInput,
  buildUpdateCustomExpenseRpcInput,
  buildUpdateEqualExpenseRpcInput,
} from "@template/supabase";

// Regression: offline expense creates/edits on mobile omitted currencyCode, and
// the builders defaulted it to PHP — a USD expense added in airplane mode was
// stored as pesos, and an offline edit of a non-PHP expense failed its replay.
// currencyCode is now required by the builder types (tsc fails without it);
// these checks pin the runtime payload the outbox replays.

const payers = [{ memberId: "m1", paidCents: 1000 }];

describe("expense RPC inputs carry currency and date", () => {
  it("creates keep the expense's own currency", () => {
    const equal = buildEqualExpenseRpcInput({
      groupId: "g",
      itemName: "Ramen",
      amountCents: 1000,
      currencyCode: "JPY",
      expenseDate: "2026-10-05",
      participantIds: ["m1"],
      payers,
    });
    expect(equal).toMatchObject({ currency_code: "JPY", expense_date: "2026-10-05" });
    const custom = buildCustomExpenseRpcInput({
      groupId: "g",
      itemName: "Taxi",
      amountCents: 1000,
      currencyCode: "USD",
      customSplits: [{ memberId: "m1", shareCents: 1000 }],
      payers,
    });
    expect(custom).toMatchObject({ currency_code: "USD" });
  });

  it("edits send the new date and the unchanged currency", () => {
    const equal = buildUpdateEqualExpenseRpcInput({
      expenseId: "e",
      itemName: "Dinner",
      amountCents: 1000,
      currencyCode: "USD",
      expenseDate: "2026-09-30",
      participantIds: ["m1"],
      payers,
    });
    expect(equal).toMatchObject({ currency_code: "USD", expense_date: "2026-09-30" });
    const custom = buildUpdateCustomExpenseRpcInput({
      expenseId: "e",
      itemName: "Dinner",
      amountCents: 1000,
      currencyCode: "PHP",
      customSplits: [{ memberId: "m1", shareCents: 1000 }],
      payers,
    });
    // No date means "keep the stored date" (the RPC COALESCEs).
    expect(custom).not.toHaveProperty("expense_date", expect.anything());
  });

  it("does not compile without a currency", () => {
    // @ts-expect-error currencyCode is required
    const input = buildEqualExpenseRpcInput({ groupId: "g", itemName: "x", amountCents: 1, participantIds: ["m1"], payers });
    expect(input).toBeDefined();
  });
});
