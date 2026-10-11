import { describe, expect, it } from "vitest";
import {
  inferSplitMode,
  parseSplitNumber,
  resolveSplit,
  splitValuesFromShares,
} from "../utils/split-resolve";
import { percentSplit, sharesSplit } from "../utils/split";

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const C = "cccccccc-0000-0000-0000-000000000003";
const labels = { [A]: "Ana", [B]: "Ben", [C]: "Cy" };

function cents(r: ReturnType<typeof resolveSplit>): number[] {
  if (!r.ok) throw new Error(r.error);
  return r.shares.map((s) => s.shareCents);
}

describe("resolveSplit", () => {
  it("equal split matches the server rule (extra cent to the lowest sorted id)", () => {
    // Display order C, A, B; server sorts ids → A gets the extra centavo.
    const r = resolveSplit({ mode: "equal", totalMinor: 1000, currency: "PHP", memberIds: [C, A, B] });
    expect(cents(r)).toEqual([333, 334, 333]);
  });

  it("odd-cent percentages always sum to the total", () => {
    const r = resolveSplit({
      mode: "percent",
      totalMinor: 1001,
      currency: "PHP",
      memberIds: [A, B, C],
      values: { [A]: "33.33", [B]: "33.33", [C]: "33.34" },
    });
    const parts = cents(r);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1001);
    expect(parts).toEqual([334, 333, 334]);
  });

  it("60/40", () => {
    const r = resolveSplit({
      mode: "percent",
      totalMinor: 250000,
      currency: "PHP",
      memberIds: [A, B],
      values: { [A]: "60", [B]: "40%" },
    });
    expect(cents(r)).toEqual([150000, 100000]);
  });

  it("rejects percentages that do not total 100", () => {
    const r = resolveSplit({
      mode: "percent",
      totalMinor: 1000,
      currency: "PHP",
      memberIds: [A, B],
      values: { [A]: "60", [B]: "30" },
      labels,
    });
    expect(r).toEqual({ ok: false, error: "Percentages add up to 90%, not 100%." });
  });

  it("rejects zero and negative and non-numeric entries", () => {
    for (const bad of ["0", "-5", "abc", "", "1e3"]) {
      const r = resolveSplit({
        mode: "percent",
        totalMinor: 1000,
        currency: "PHP",
        memberIds: [A, B],
        values: { [A]: bad, [B]: "100" },
        labels,
      });
      expect(r.ok).toBe(false);
    }
  });

  it("shares: blank defaults to 1, asymmetric 2:1:1", () => {
    const r = resolveSplit({
      mode: "shares",
      totalMinor: 100001,
      currency: "PHP",
      memberIds: [A, B, C],
      values: { [A]: "2", [B]: "" },
    });
    const parts = cents(r);
    expect(parts).toEqual([50001, 25000, 25000]);
  });

  it("exact amounts must add up, with a helpful remainder", () => {
    const short = resolveSplit({
      mode: "exact",
      totalMinor: 100000,
      currency: "PHP",
      memberIds: [A, B],
      values: { [A]: "600", [B]: "300" },
    });
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.error).toContain("still needs to be assigned");
    const over = resolveSplit({
      mode: "exact",
      totalMinor: 100000,
      currency: "PHP",
      memberIds: [A, B],
      values: { [A]: "700", [B]: "400" },
    });
    if (!over.ok) expect(over.error).toContain("over the total");
    const ok = resolveSplit({
      mode: "exact",
      totalMinor: 100000,
      currency: "PHP",
      memberIds: [A, B],
      values: { [A]: "700", [B]: "300" },
    });
    expect(cents(ok)).toEqual([70000, 30000]);
  });

  it("respects zero-decimal currencies", () => {
    const r = resolveSplit({
      mode: "exact",
      totalMinor: 1000,
      currency: "JPY",
      memberIds: [A, B],
      values: { [A]: "600", [B]: "400" },
    });
    expect(cents(r)).toEqual([600, 400]);
    const tooPrecise = resolveSplit({
      mode: "exact",
      totalMinor: 1000,
      currency: "JPY",
      memberIds: [A, B],
      values: { [A]: "600.5", [B]: "399.5" },
    });
    expect(tooPrecise.ok).toBe(false);
  });

  it("refuses a part that rounds to zero (the database requires > 0)", () => {
    const r = resolveSplit({
      mode: "percent",
      totalMinor: 10,
      currency: "PHP",
      memberIds: [A, B],
      values: { [A]: "99.9", [B]: "0.1" },
      labels,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Ben");
    const eq = resolveSplit({ mode: "equal", totalMinor: 2, currency: "PHP", memberIds: [A, B, C] });
    expect(eq.ok).toBe(false);
  });

  it("refuses empty, duplicate and non-positive inputs", () => {
    expect(resolveSplit({ mode: "equal", totalMinor: 100, currency: "PHP", memberIds: [] }).ok).toBe(false);
    expect(resolveSplit({ mode: "equal", totalMinor: 100, currency: "PHP", memberIds: [A, A] }).ok).toBe(false);
    expect(resolveSplit({ mode: "equal", totalMinor: 0, currency: "PHP", memberIds: [A] }).ok).toBe(false);
    expect(resolveSplit({ mode: "equal", totalMinor: 1.5, currency: "PHP", memberIds: [A] }).ok).toBe(false);
  });

  it("random splits always sum exactly, including amounts beyond float-safe products", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let k = 0; k < 300; k++) {
      const total = 1 + Math.floor(rand() * 9_000_000_000_000);
      const weights = [1 + Math.floor(rand() * 9), 1 + Math.floor(rand() * 9), 1 + Math.floor(rand() * 9)];
      const parts = sharesSplit(total, weights);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      expect(parts.every((p) => Number.isSafeInteger(p) && p >= 0)).toBe(true);
    }
    expect(percentSplit(Number.MAX_SAFE_INTEGER, [33.33, 33.33, 33.34]).reduce((a, b) => a + b, 0)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });
});

describe("splitValuesFromShares", () => {
  const shares = [
    { memberId: A, shareCents: 150000 },
    { memberId: B, shareCents: 100000 },
  ];
  it("prefills percentages that add to exactly 100", () => {
    expect(splitValuesFromShares("percent", shares, "PHP")).toEqual({ [A]: "60", [B]: "40" });
    const thirds = splitValuesFromShares(
      "percent",
      [
        { memberId: A, shareCents: 334 },
        { memberId: B, shareCents: 333 },
        { memberId: C, shareCents: 333 },
      ],
      "PHP",
    );
    const sum = Object.values(thirds).reduce((a, v) => a + Math.round(Number(v) * 100), 0);
    expect(sum).toBe(10000);
  });
  it("prefills simple share ratios and exact amounts", () => {
    expect(splitValuesFromShares("shares", shares, "PHP")).toEqual({ [A]: "3", [B]: "2" });
    expect(splitValuesFromShares("exact", shares, "PHP")).toEqual({ [A]: "1500.00", [B]: "1000.00" });
  });
  it("round-trips: prefilled values resolve back to the same cents", () => {
    for (const mode of ["percent", "shares", "exact"] as const) {
      const values = splitValuesFromShares(mode, shares, "PHP");
      const r = resolveSplit({ mode, totalMinor: 250000, currency: "PHP", memberIds: [A, B], values });
      expect(cents(r)).toEqual([150000, 100000]);
    }
  });
});

describe("inferSplitMode / parseSplitNumber", () => {
  it("equal only when it is exactly the server's equal split", () => {
    expect(inferSplitMode([{ memberId: A, shareCents: 334 }, { memberId: B, shareCents: 333 }, { memberId: C, shareCents: 333 }])).toBe("equal");
    // Same spread but the extra centavo is on a later id → was entered exactly.
    expect(inferSplitMode([{ memberId: A, shareCents: 333 }, { memberId: B, shareCents: 334 }, { memberId: C, shareCents: 333 }])).toBe("exact");
    expect(inferSplitMode([{ memberId: A, shareCents: 600 }, { memberId: B, shareCents: 400 }])).toBe("exact");
  });
  it("parses plain decimals only", () => {
    expect(parseSplitNumber(" 12.5 ")).toBe(12.5);
    expect(parseSplitNumber("40%")).toBe(40);
    expect(parseSplitNumber(".5")).toBe(0.5);
    expect(parseSplitNumber("1,5")).toBeNull();
    expect(parseSplitNumber("1.23456")).toBeNull();
    expect(parseSplitNumber("Infinity")).toBeNull();
  });
});

describe("review fixes", () => {
  it("keeps a lopsided stored ratio when switching to shares", () => {
    const stored = [
      { memberId: A, shareCents: 100000 },
      { memberId: B, shareCents: 100 },
    ];
    const values = splitValuesFromShares("shares", stored, "PHP");
    expect(values).toEqual({ [A]: "1000", [B]: "1" });
    const r = resolveSplit({ mode: "shares", totalMinor: 100100, currency: "PHP", memberIds: [A, B], values });
    expect(cents(r)).toEqual([100000, 100]);
  });

  it("allocates tiny scientific-notation weights instead of throwing", () => {
    expect(sharesSplit(100, [1e-7, 1e-7])).toEqual([50, 50]);
    expect(sharesSplit(100, [3e-8, 1e-8])).toEqual([75, 25]);
  });
});
