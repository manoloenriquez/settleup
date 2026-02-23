import { describe, it, expect } from "vitest";
import { parseExpenseText, fuzzyMatchMember } from "../utils/parser";

describe("parseExpenseText", () => {
  it("parses full input with split keyword", () => {
    const result = parseExpenseText("Wahunori 8703.39 split Manolo Yao");
    expect(result.itemName).toBe("Wahunori");
    expect(result.amountCents).toBe(870339);
    expect(result.participantNames).toEqual(["Manolo", "Yao"]);
  });

  it("parses input without split keyword", () => {
    const result = parseExpenseText("Green Pepper 2717");
    expect(result.itemName).toBe("Green Pepper");
    expect(result.amountCents).toBe(271700);
    expect(result.participantNames).toEqual([]);
  });

  it("parses with names after amount (no split keyword)", () => {
    const result = parseExpenseText("Lunch 1200 Manolo Yao Alvaro");
    expect(result.itemName).toBe("Lunch");
    expect(result.amountCents).toBe(120000);
    expect(result.participantNames).toEqual(["Manolo", "Yao", "Alvaro"]);
  });

  it("parses amount with commas", () => {
    const result = parseExpenseText("Hotel 8,703.39");
    expect(result.itemName).toBe("Hotel");
    expect(result.amountCents).toBe(870339);
  });

  it("parses amount with peso sign", () => {
    const result = parseExpenseText("Drinks ₱500");
    expect(result.itemName).toBe("Drinks");
    expect(result.amountCents).toBe(50000);
  });

  it("returns null amountCents when no number", () => {
    const result = parseExpenseText("Just text no number");
    expect(result.amountCents).toBeNull();
    expect(result.participantNames).toEqual([]);
  });

  it("returns empty participantNames for split with no names", () => {
    const result = parseExpenseText("Dinner 2000 split");
    expect(result.itemName).toBe("Dinner");
    expect(result.amountCents).toBe(200000);
    expect(result.participantNames).toEqual([]);
  });
});

describe("fuzzyMatchMember", () => {
  const members = [
    { id: "1", display_name: "Manolo" },
    { id: "2", display_name: "Yao" },
    { id: "3", display_name: "Alvaro" },
  ];

  it("matches exact name case-insensitively", () => {
    expect(fuzzyMatchMember("manolo", members)).toBe("1");
  });

  it("matches by startsWith", () => {
    expect(fuzzyMatchMember("Alv", members)).toBe("3");
  });

  it("matches by contains", () => {
    expect(fuzzyMatchMember("lvaro", members)).toBe("3");
  });

  it("returns null for no match", () => {
    expect(fuzzyMatchMember("Dustin", members)).toBeNull();
  });
});
