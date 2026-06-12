import { describe, expect, it } from "vitest";
import { buildNudgeMessage } from "./messages";

describe("buildNudgeMessage", () => {
  it("includes names, group, and formatted amount", () => {
    const msg = buildNudgeMessage({
      debtorName: "Ana",
      creditorName: "Manolo",
      amountCents: 124335,
      groupName: "Boracay Trip",
    });
    expect(msg).toBe("Hi Ana! Friendly reminder from Boracay Trip: you owe Manolo ₱1,243.35.");
  });

  it("appends the personal link when provided", () => {
    const msg = buildNudgeMessage({
      debtorName: "Ana",
      creditorName: "Manolo",
      amountCents: 50000,
      groupName: "Dinner",
      link: "https://settleup.test/p/abc123",
    });
    expect(msg).toContain("₱500.00");
    expect(msg.endsWith("View details & pay here: https://settleup.test/p/abc123")).toBe(true);
  });

  it("omits the link line for null link", () => {
    const msg = buildNudgeMessage({
      debtorName: "Ana",
      creditorName: "Manolo",
      amountCents: 100,
      groupName: "Dinner",
      link: null,
    });
    expect(msg).not.toContain("\n");
  });
});
