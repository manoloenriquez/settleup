import { describe, expect, it } from "vitest";
import { expenseStake } from "../expense-stake";

const names: Record<string, string> = { ana: "Ana", carla: "Carla", dina: "Dina" };
const nameOf = (id: string) => names[id] ?? "?";
const equal = (ids: string[], each: number) => ids.map((member_id) => ({ member_id, share_cents: each }));

describe("expense stake line", () => {
  it("you paid for three: you lent the other two shares", () => {
    expect(expenseStake([{ member_id: "ana", paid_cents: 30000 }], equal(["ana", "carla", "dina"], 10000), "ana", nameOf)).toEqual({
      paidBy: "You paid",
      tone: "lent",
      amountMinor: 20000,
    });
  });

  it("someone else paid: your share", () => {
    expect(expenseStake([{ member_id: "carla", paid_cents: 135000 }], equal(["ana", "carla", "dina"], 45000), "ana", nameOf)).toEqual({
      paidBy: "Carla paid",
      tone: "share",
      amountMinor: 45000,
    });
  });

  it("several payers and not involved", () => {
    expect(
      expenseStake(
        [
          { member_id: "carla", paid_cents: 500 },
          { member_id: "dina", paid_cents: 500 },
        ],
        equal(["carla", "dina"], 500),
        "ana",
        nameOf,
      ),
    ).toEqual({ paidBy: "2 people paid", tone: "none", amountMinor: 0 });
  });

  it("paid part of your own share", () => {
    expect(
      expenseStake(
        [
          { member_id: "ana", paid_cents: 100 },
          { member_id: "carla", paid_cents: 500 },
        ],
        equal(["ana", "carla"], 300),
        "ana",
        nameOf,
      ),
    ).toEqual({ paidBy: "2 people paid", tone: "share", amountMinor: 200 });
  });

  it("paid exactly your own share: no stake line", () => {
    expect(
      expenseStake(
        [
          { member_id: "ana", paid_cents: 300 },
          { member_id: "carla", paid_cents: 300 },
        ],
        equal(["ana", "carla"], 300),
        "ana",
        nameOf,
      ),
    ).toEqual({ paidBy: "2 people paid", tone: "none", amountMinor: 0 });
  });
});
