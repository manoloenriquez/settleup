import { describe, expect, it } from "vitest";
import { resolveExactMember } from "../utils/member-resolution";

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
