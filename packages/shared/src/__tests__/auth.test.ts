import { describe, expect, it } from "vitest";
import { safeReturnPath } from "../utils/auth";

describe("authentication destinations", () => {
  it("preserves invitation query strings", () => {
    expect(safeReturnPath("/join?code=abc")).toBe("/join?code=abc");
    expect(safeReturnPath("/claim?token=abc")).toBe("/claim?token=abc");
  });
  it.each([
    "//evil.test",
    "/\\evil.test",
    "https://evil.test",
    "/%2f%2fevil.test",
    "/auth/callback",
    "/login",
    "/\nevil.test",
    undefined,
  ])("rejects unsafe destination %s", (input) => {
    expect(safeReturnPath(input)).toBe("/dashboard");
  });
});
