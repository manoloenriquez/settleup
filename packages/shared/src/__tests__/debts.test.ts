import { describe, it, expect } from "vitest";
import { simplifyDebts } from "../utils/debts";

function mb(id: string, name: string, net: number) {
  return { member_id: id, display_name: name, net_cents: net };
}

describe("simplifyDebts", () => {
  it("returns empty array for no members", () => {
    expect(simplifyDebts([])).toEqual([]);
  });

  it("returns empty array when all settled (net = 0)", () => {
    expect(
      simplifyDebts([mb("a", "Alice", 0), mb("b", "Bob", 0)]),
    ).toEqual([]);
  });

  it("single debtor → single creditor", () => {
    const debts = simplifyDebts([
      mb("a", "Alice", -500),
      mb("b", "Bob", 500),
    ]);
    expect(debts).toEqual([
      {
        from_member_id: "a",
        from_display_name: "Alice",
        to_member_id: "b",
        to_display_name: "Bob",
        amount_cents: 500,
      },
    ]);
  });

  it("two debtors → one creditor", () => {
    const debts = simplifyDebts([
      mb("a", "Alice", -300),
      mb("b", "Bob", -200),
      mb("c", "Carol", 500),
    ]);
    // Alice (300) matched first (larger), then Bob (200)
    expect(debts).toHaveLength(2);
    expect(debts[0]).toMatchObject({
      from_display_name: "Alice",
      to_display_name: "Carol",
      amount_cents: 300,
    });
    expect(debts[1]).toMatchObject({
      from_display_name: "Bob",
      to_display_name: "Carol",
      amount_cents: 200,
    });
  });

  it("one debtor → two creditors", () => {
    const debts = simplifyDebts([
      mb("a", "Alice", -500),
      mb("b", "Bob", 300),
      mb("c", "Carol", 200),
    ]);
    expect(debts).toHaveLength(2);
    expect(debts[0]).toMatchObject({
      from_display_name: "Alice",
      to_display_name: "Bob",
      amount_cents: 300,
    });
    expect(debts[1]).toMatchObject({
      from_display_name: "Alice",
      to_display_name: "Carol",
      amount_cents: 200,
    });
  });

  it("two debtors → two creditors (cross-matching)", () => {
    // A owes 700, B owes 300, C owed 600, D owed 400
    const debts = simplifyDebts([
      mb("a", "Alice", -700),
      mb("b", "Bob", -300),
      mb("c", "Carol", 600),
      mb("d", "Dave", 400),
    ]);
    // A(700) → C(600): transfer 600, A left 100
    // A(100) → D(400): transfer 100, D left 300
    // B(300) → D(300): transfer 300
    expect(debts).toHaveLength(3);
    expect(debts[0]).toMatchObject({
      from_display_name: "Alice",
      to_display_name: "Carol",
      amount_cents: 600,
    });
    expect(debts[1]).toMatchObject({
      from_display_name: "Alice",
      to_display_name: "Dave",
      amount_cents: 100,
    });
    expect(debts[2]).toMatchObject({
      from_display_name: "Bob",
      to_display_name: "Dave",
      amount_cents: 300,
    });
  });

  it("handles single-cent precision", () => {
    const debts = simplifyDebts([
      mb("a", "Alice", -1),
      mb("b", "Bob", 1),
    ]);
    expect(debts).toEqual([
      {
        from_member_id: "a",
        from_display_name: "Alice",
        to_member_id: "b",
        to_display_name: "Bob",
        amount_cents: 1,
      },
    ]);
  });

  it("total debts equal total credits", () => {
    const balances = [
      mb("a", "A", -400),
      mb("b", "B", -250),
      mb("c", "C", -150),
      mb("d", "D", 500),
      mb("e", "E", 300),
    ];
    const debts = simplifyDebts(balances);
    const totalTransferred = debts.reduce((s, d) => s + d.amount_cents, 0);
    expect(totalTransferred).toBe(800);
  });

  it("ignores members with zero balance mixed with others", () => {
    const debts = simplifyDebts([
      mb("a", "Alice", -100),
      mb("b", "Bob", 0),
      mb("c", "Carol", 100),
    ]);
    expect(debts).toHaveLength(1);
    expect(debts[0]).toMatchObject({
      from_display_name: "Alice",
      to_display_name: "Carol",
      amount_cents: 100,
    });
  });
});
