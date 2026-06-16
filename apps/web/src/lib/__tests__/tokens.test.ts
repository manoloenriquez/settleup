import { describe, it, expect } from "vitest";
import { generateShareToken } from "../tokens";

describe("generateShareToken", () => {
  it("default length is 22", () => {
    expect(generateShareToken()).toHaveLength(22);
  });

  it("custom length is respected", () => {
    expect(generateShareToken(10)).toHaveLength(10);
  });

  it("output contains only Base62 characters", () => {
    expect(generateShareToken(50)).toMatch(/^[A-Za-z0-9]+$/);
  });

  it("produces unique values across 50 calls", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateShareToken()));
    expect(tokens.size).toBe(50);
  });

  it("handles length 1", () => {
    const token = generateShareToken(1);
    expect(token).toHaveLength(1);
    expect(token).toMatch(/^[A-Za-z0-9]$/);
  });
});
