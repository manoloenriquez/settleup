import { describe, it, expect } from "vitest";
import { inferCategorySlug, inferReceiptCategory, isCategorySlug } from "../utils/category";

describe("inferCategorySlug", () => {
  it("matches merchants and item words", () => {
    expect(inferCategorySlug("KIWAMI BGC")).toBe("food-drinks");
    expect(inferCategorySlug("Grab to the airport")).toBe("transport");
    expect(inferCategorySlug("Puregold Makati")).toBe("groceries");
    expect(inferCategorySlug("Airbnb Baguio")).toBe("lodging");
    expect(inferCategorySlug("Island hopping tickets")).toBe("activities");
    expect(inferCategorySlug("Uniqlo")).toBe("shopping");
    expect(inferCategorySlug("Mercury Drug")).toBe("supplies");
    expect(inferCategorySlug("Visa fee")).toBe("fees");
  });
  it("prefers the specific bucket over food and returns null for unknown text", () => {
    expect(inferCategorySlug("Starbucks at the airport")).toBe("transport");
    expect(inferCategorySlug("Zxqv Ltd")).toBeNull();
    expect(inferCategorySlug("")).toBeNull();
    expect(inferCategorySlug(null)).toBeNull();
  });
});

describe("inferReceiptCategory", () => {
  it("falls back from merchant to item names to other", () => {
    expect(inferReceiptCategory(null, ["Hoegarden Large", "Sht Jim Beam"])).toBe("food-drinks");
    expect(inferReceiptCategory("Dynamic Global Enterprise Systems", ["Pancake 2pcs", "Sd Sausage"])).toBe("other");
    expect(inferReceiptCategory("Jollibee", [])).toBe("food-drinks");
  });
});

describe("isCategorySlug", () => {
  it("guards unknown slugs", () => {
    expect(isCategorySlug("groceries")).toBe(true);
    expect(isCategorySlug("snacks")).toBe(false);
    expect(isCategorySlug(null)).toBe(false);
  });
});
