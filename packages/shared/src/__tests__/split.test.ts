import { describe, it, expect } from "vitest";
import { equalSplit, generateSlug } from "../utils/split";

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
