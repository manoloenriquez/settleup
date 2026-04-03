import { describe, it, expect } from "vitest";
import { parseConversation } from "../conversation";

// LLM_ENABLED is not set → always uses heuristic fallback.

describe("parseConversation", () => {
  it("returns error when messages array is empty", async () => {
    const result = await parseConversation({ messages: [], member_names: ["Alice", "Bob"], userId: "u1" });
    expect(result.error).toBe("No messages provided");
    expect(result.data).toBeNull();
  });

  it("parses 'Lunch 500 split Manolo Yao' into a draft", async () => {
    const result = await parseConversation({
      messages: [{ role: "user", content: "Lunch 500 split Manolo Yao" }],
      member_names: ["Manolo", "Yao"],
      userId: "u1",
    });
    expect(result.error).toBeNull();
    expect(result.data?.draft?.item_name).toBe("Lunch");
    expect(result.data?.draft?.amount_cents).toBe(50000);
    expect(result.data?.draft?.participant_names).toContain("Manolo");
    expect(result.data?.draft?.participant_names).toContain("Yao");
  });

  it("falls back to all members when no split keyword is provided", async () => {
    const result = await parseConversation({
      messages: [{ role: "user", content: "Lunch 500" }],
      member_names: ["Alice", "Bob", "Carol"],
      userId: "u1",
    });
    expect(result.data?.draft?.participant_names).toEqual(["Alice", "Bob", "Carol"]);
  });

  it("reply text contains the item name", async () => {
    const result = await parseConversation({
      messages: [{ role: "user", content: "Dinner 300" }],
      member_names: ["A"],
      userId: "u1",
    });
    expect(result.data?.reply).toContain("Dinner");
  });

  it("draft.source is 'conversation'", async () => {
    const result = await parseConversation({
      messages: [{ role: "user", content: "Coffee 100" }],
      member_names: ["A"],
      userId: "u1",
    });
    expect(result.data?.draft?.source).toBe("conversation");
  });

  it("draft.confidence is 0.7", async () => {
    const result = await parseConversation({
      messages: [{ role: "user", content: "Coffee 100" }],
      member_names: ["A"],
      userId: "u1",
    });
    expect(result.data?.draft?.confidence).toBe(0.7);
  });

  it("fuzzy-matches partial member names", async () => {
    const result = await parseConversation({
      messages: [{ role: "user", content: "Lunch 500 split Man" }],
      member_names: ["Manolo", "Yao"],
      userId: "u1",
    });
    expect(result.data?.draft?.participant_names).toContain("Manolo");
  });

  it("non-expense text with no amount results in amount_cents 0", async () => {
    const result = await parseConversation({
      messages: [{ role: "user", content: "hello there" }],
      member_names: ["A"],
      userId: "u1",
    });
    // parseExpenseText returns null for non-expense text, so data.draft is null or amount_cents is 0
    if (result.data?.draft) {
      expect(result.data.draft.amount_cents).toBe(0);
    } else {
      expect(result.data?.draft).toBeNull();
    }
  });
});
