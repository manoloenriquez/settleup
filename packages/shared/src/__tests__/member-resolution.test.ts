import { describe, expect, it } from "vitest";
import { parsePeopleNames, resolveExactMember } from "../utils/member-resolution";

describe("reviewing suggested identities", () => {
  const members = [
    { id: "a", display_name: "Ana" },
    { id: "b", display_name: "Anna" },
  ];
  it("accepts one exact normalized match", () => {
    expect(resolveExactMember(" ANA ", members)).toBe("a");
  });
  it("requires correction for unknown, absent, or ambiguous names", () => {
    expect(resolveExactMember("An", members)).toBeNull();
    expect(resolveExactMember(null, members)).toBeNull();
    expect(resolveExactMember("Ana", [...members, { id: "c", display_name: "ANA" }])).toBeNull();
  });
});

describe("parsePeopleNames", () => {
  it("splits on commas, 'and', '&' and new lines", () => {
    expect(parsePeopleNames("Carla, Dina and Eli & Fe\nGio")).toEqual(["Carla", "Dina", "Eli", "Fe", "Gio"]);
  });

  it("drops blanks, repeats and people already in the group", () => {
    expect(parsePeopleNames(" carla ,, Carla, Ana , dina", ["Ana"])).toEqual(["carla", "dina"]);
  });

  it("keeps names that merely contain 'and'", () => {
    expect(parsePeopleNames("Andrea, Sandy")).toEqual(["Andrea", "Sandy"]);
  });

  it("caps at 50 names", () => {
    const many = Array.from({ length: 60 }, (_, i) => `P${i}`).join(",");
    expect(parsePeopleNames(many)).toHaveLength(50);
  });
});
