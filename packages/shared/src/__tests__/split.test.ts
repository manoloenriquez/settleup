import { describe, it, expect } from "vitest";
import { equalSplit, generateSlug, isEqualShareSplit, percentSplit, sharesSplit } from "../utils/split";

describe("equalSplit", () => {
  it("splits evenly when divisible", () => {
    expect(equalSplit(300, 3)).toEqual([100, 100, 100]);
  });

  it("distributes remainder: 100 ÷ 3 = [34, 33, 33]", () => {
    expect(equalSplit(100, 3)).toEqual([34, 33, 33]);
  });

  it("handles n=1", () => {
    expect(equalSplit(500, 1)).toEqual([500]);
  });

  it("wahunori 7-way split", () => {
    // 870339 / 7 = 124334 r 1 → [124335, 124334, 124334, 124334, 124334, 124334, 124334]
    const shares = equalSplit(870339, 7);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(870339);
    expect(shares[0]).toBe(124335);
    expect(shares.slice(1).every((s) => s === 124334)).toBe(true);
  });

  it("green pepper 4-way split", () => {
    // 271700 / 4 = 67925 r 0
    const shares = equalSplit(271700, 4);
    expect(shares).toEqual([67925, 67925, 67925, 67925]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(271700);
  });

  it("eastwing 3-way split", () => {
    // 829998 / 3 = 276666 r 0
    const shares = equalSplit(829998, 3);
    expect(shares).toEqual([276666, 276666, 276666]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(829998);
  });

  it("throws for n=0", () => {
    expect(() => equalSplit(100, 0)).toThrow();
  });
});

describe("isEqualShareSplit", () => {
  it("returns false for empty shares", () => {
    expect(isEqualShareSplit([])).toBe(false);
  });

  it("returns true for a single participant", () => {
    expect(isEqualShareSplit([500])).toBe(true);
  });

  it("returns true for identical shares", () => {
    expect(isEqualShareSplit([100, 100, 100])).toBe(true);
  });

  it("tolerates 1-cent rounding spread", () => {
    expect(isEqualShareSplit([34, 33, 33])).toBe(true);
  });

  it("returns false for custom splits", () => {
    expect(isEqualShareSplit([600, 400])).toBe(false);
  });
});

describe("generateSlug", () => {
  it("basic slug", () => {
    expect(generateSlug("John Doe", [])).toBe("john-doe");
  });

  it("appends -2 on collision", () => {
    expect(generateSlug("John Doe", ["john-doe"])).toBe("john-doe-2");
  });

  it("appends -3 when -2 also exists", () => {
    expect(generateSlug("John Doe", ["john-doe", "john-doe-2"])).toBe("john-doe-3");
  });

  it("strips special characters", () => {
    expect(generateSlug("Alvaro!", [])).toBe("alvaro");
  });

  it("handles single name", () => {
    expect(generateSlug("Manolo", [])).toBe("manolo");
  });
});

describe("percentSplit", () => {
  it("splits 60/40 exactly", () => {
    expect(percentSplit(10000, [60, 40])).toEqual([6000, 4000]);
  });

  it("handles thirds with float percents summing to 100", () => {
    const shares = percentSplit(10000, [33.33, 33.33, 33.34]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it("gives leftover cents to the largest remainders", () => {
    // 101 * 0.5 = 50.5 each → both remainders tie, lower index wins the cent
    expect(percentSplit(101, [50, 50])).toEqual([51, 50]);
  });

  it("always sums to the total across random inputs", () => {
    for (let i = 0; i < 200; i++) {
      const total = 1 + Math.floor(Math.random() * 1_000_000);
      const a = Math.random() * 100;
      const b = Math.random() * (100 - a);
      const shares = percentSplit(total, [a, b, 100 - a - b]);
      expect(shares.reduce((x, y) => x + y, 0)).toBe(total);
      expect(shares.every((s) => s >= 0)).toBe(true);
    }
  });

  it("rejects percents that don't sum to 100", () => {
    expect(() => percentSplit(10000, [60, 30])).toThrow();
  });

  it("rejects negative percents", () => {
    expect(() => percentSplit(10000, [110, -10])).toThrow();
  });

  it("rejects empty input", () => {
    expect(() => percentSplit(10000, [])).toThrow();
  });
});

describe("sharesSplit", () => {
  it("splits 2:1:1", () => {
    expect(sharesSplit(10000, [2, 1, 1])).toEqual([5000, 2500, 2500]);
  });

  it("handles fractional weights", () => {
    const shares = sharesSplit(10000, [1.5, 1, 1]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10000);
    expect(shares[0]!).toBeGreaterThan(shares[1]!);
  });

  it("distributes indivisible remainders exactly", () => {
    // 100 / [1,1,1] behaves like equalSplit
    expect(sharesSplit(100, [1, 1, 1])).toEqual([34, 33, 33]);
  });

  it("always sums to the total across random inputs", () => {
    for (let i = 0; i < 200; i++) {
      const total = 1 + Math.floor(Math.random() * 1_000_000);
      const weights = Array.from({ length: 2 + Math.floor(Math.random() * 5) }, () => 0.1 + Math.random() * 5);
      const shares = sharesSplit(total, weights);
      expect(shares.reduce((x, y) => x + y, 0)).toBe(total);
    }
  });

  it("rejects non-positive weights", () => {
    expect(() => sharesSplit(10000, [1, 0])).toThrow();
    expect(() => sharesSplit(10000, [1, -2])).toThrow();
  });

  it("rejects empty input", () => {
    expect(() => sharesSplit(10000, [])).toThrow();
  });
});
