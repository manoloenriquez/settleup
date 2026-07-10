import { describe, it, expect } from "vitest";
import { simplifyDebts, computePairwiseDebts } from "../utils/debts";

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

function payer(id: string, name: string, paid: number) {
  return { member_id: id, display_name: name, paid_cents: paid };
}

function part(id: string, name: string, share: number) {
  return { member_id: id, display_name: name, share_cents: share };
}

describe("computePairwiseDebts", () => {
  it("returns empty for no expenses and no payments", () => {
    expect(computePairwiseDebts([], [])).toEqual([]);
  });

  it("single payer, equal split: each other participant owes the payer", () => {
    const debts = computePairwiseDebts(
      [
        {
          payers: [payer("a", "Alice", 900)],
          participants: [part("a", "Alice", 300), part("b", "Bob", 300), part("c", "Carol", 300)],
        },
      ],
      [],
    );
    expect(debts).toHaveLength(2);
    for (const d of debts) {
      expect(d.to_display_name).toBe("Alice");
      expect(d.amount_cents).toBe(300);
    }
  });

  it("multi-payer: shares attributed proportionally to what each payer paid", () => {
    // Alice paid 600, Bob paid 400; Carol's 500 share → 300 to Alice, 200 to Bob
    const debts = computePairwiseDebts(
      [
        {
          payers: [payer("a", "Alice", 600), payer("b", "Bob", 400)],
          participants: [part("a", "Alice", 250), part("b", "Bob", 250), part("c", "Carol", 500)],
        },
      ],
      [],
    );
    const carolToAlice = debts.find((d) => d.from_member_id === "c" && d.to_member_id === "a");
    const carolToBob = debts.find((d) => d.from_member_id === "c" && d.to_member_id === "b");
    expect(carolToAlice?.amount_cents).toBe(300);
    expect(carolToBob?.amount_cents).toBe(200);
  });

  it("largest-remainder rounding: allocations add up to the exact share", () => {
    // 100 split across payers 1/1/1 → 34 + 33 + 33
    const debts = computePairwiseDebts(
      [
        {
          payers: [payer("a", "Alice", 1), payer("b", "Bob", 1), payer("c", "Carol", 1)],
          participants: [part("d", "Dave", 100)],
        },
      ],
      [],
    );
    const total = debts.reduce((s, d) => s + d.amount_cents, 0);
    expect(total).toBe(100);
    expect(debts.map((d) => d.amount_cents).sort((x, y) => y - x)).toEqual([34, 33, 33]);
  });

  it("cross-expense netting: opposite directions collapse to one row", () => {
    const debts = computePairwiseDebts(
      [
        {
          payers: [payer("a", "Alice", 1000)],
          participants: [part("a", "Alice", 500), part("b", "Bob", 500)],
        },
        {
          payers: [payer("b", "Bob", 600)],
          participants: [part("a", "Alice", 300), part("b", "Bob", 300)],
        },
      ],
      [],
    );
    // Bob owes Alice 500, Alice owes Bob 300 → Bob owes Alice 200
    expect(debts).toEqual([
      {
        from_member_id: "b",
        from_display_name: "Bob",
        to_member_id: "a",
        to_display_name: "Alice",
        amount_cents: 200,
      },
    ]);
  });

  it("recorded payments reduce the pair's debt", () => {
    const debts = computePairwiseDebts(
      [
        {
          payers: [payer("a", "Alice", 1000)],
          participants: [part("a", "Alice", 500), part("b", "Bob", 500)],
        },
      ],
      [
        {
          from_member_id: "b",
          from_display_name: "Bob",
          to_member_id: "a",
          to_display_name: "Alice",
          amount_cents: 500,
        },
      ],
    );
    expect(debts).toEqual([]);
  });

  it("skips expenses without payer data (deploy-order / credit expenses)", () => {
    const debts = computePairwiseDebts(
      [{ participants: [part("a", "Alice", 500), part("b", "Bob", 500)] }],
      [],
    );
    expect(debts).toEqual([]);
  });

  it("no self-debt when a payer is also a participant", () => {
    const debts = computePairwiseDebts(
      [
        {
          payers: [payer("a", "Alice", 400)],
          participants: [part("a", "Alice", 400)],
        },
      ],
      [],
    );
    expect(debts).toEqual([]);
  });
});
