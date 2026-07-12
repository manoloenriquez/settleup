import { describe, expect, it } from "vitest";
import { DESIGN_TOKENS, ROUTES } from "../constants";

describe("design system contract", () => {
  it("provides distinct semantic states and accessible-sized controls", () => {
    expect(DESIGN_TOKENS.color.positive).not.toBe(DESIGN_TOKENS.color.outgoing);
    expect(DESIGN_TOKENS.radius.control).toBeGreaterThanOrEqual(8);
    expect(ROUTES.EXPENSE_NEW).toBe("/expenses/new");
  });
});
