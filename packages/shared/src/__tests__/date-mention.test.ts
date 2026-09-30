import { describe, it, expect } from "vitest";
import { resolveDateMention } from "../utils/date-mention";

// 2026-09-30 is a Wednesday.
const today = "2026-09-30";

describe("resolveDateMention", () => {
  it("resolves relative words", () => {
    expect(resolveDateMention("today", today)).toBe("2026-09-30");
    expect(resolveDateMention("yesterday", today)).toBe("2026-09-29");
    expect(resolveDateMention("Last night", today)).toBe("2026-09-29");
    expect(resolveDateMention("3 days ago", today)).toBe("2026-09-27");
    expect(resolveDateMention("two weeks ago", today)).toBe("2026-09-16");
  });
  it("resolves weekdays to the most recent past occurrence", () => {
    expect(resolveDateMention("last Friday", today)).toBe("2026-09-25");
    expect(resolveDateMention("Monday", today)).toBe("2026-09-28");
    expect(resolveDateMention("Wednesday", today)).toBe("2026-09-23");
  });
  it("resolves explicit dates and rejects the far future", () => {
    expect(resolveDateMention("March 3", today)).toBe("2026-03-03");
    expect(resolveDateMention("3 March 2026", today)).toBe("2026-03-03");
    expect(resolveDateMention("09/28", today)).toBe("2026-09-28");
    expect(resolveDateMention("2026-09-01", today)).toBe("2026-09-01");
    expect(resolveDateMention("Dec 25", today)).toBe("2025-12-25");
    expect(resolveDateMention("2030-01-01", today)).toBeNull();
  });
  it("returns null for junk", () => {
    expect(resolveDateMention(null, today)).toBeNull();
    expect(resolveDateMention("sometime", today)).toBeNull();
    expect(resolveDateMention("13/45", today)).toBeNull();
  });
});
