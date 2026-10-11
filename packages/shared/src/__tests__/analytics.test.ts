import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  PRODUCT_EVENT_NAMES,
  PRODUCT_EVENT_SPEC,
  PUBLIC_PRODUCT_EVENTS,
  createTracker,
  errorClassFor,
  isValidProductEvent,
  participantBucket,
} from "../analytics";

const MIGRATION = resolve(__dirname, "../../../../supabase/migrations/20260909130000_product_events.sql");

/** Parses the WHEN '<event>' THEN '<json>' rows of settleup.product_event_spec. */
function specFromMigration(): Record<string, Record<string, string[]>> {
  const sql = readFileSync(MIGRATION, "utf8");
  const body = sql.slice(sql.indexOf("FUNCTION settleup.product_event_spec"), sql.indexOf("ELSE NULL"));
  const spec: Record<string, Record<string, string[]>> = {};
  for (const match of body.matchAll(/WHEN '([a-z_]+)'\s+THEN '(\{.*?\})'::jsonb/g)) {
    spec[match[1]!] = JSON.parse(match[2]!) as Record<string, string[]>;
  }
  return spec;
}

describe("product event taxonomy", () => {
  it("covers exactly the sixteen PRD 12.4 events", () => {
    expect(PRODUCT_EVENT_NAMES).toHaveLength(16);
    expect(new Set(PRODUCT_EVENT_NAMES).size).toBe(16);
  });

  it("matches the database allowlist in the product_events migration", () => {
    const fromSql = specFromMigration();
    expect(Object.keys(fromSql).sort()).toEqual([...PRODUCT_EVENT_NAMES].sort());
    for (const name of PRODUCT_EVENT_NAMES) {
      const shared = Object.fromEntries(
        Object.entries(PRODUCT_EVENT_SPEC[name]).map(([key, values]) => [key, [...values]]),
      );
      expect(fromSql[name], name).toEqual(shared);
    }
  });

  it("lists only events the anonymous RPC accepts", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const guard = /p_event_name NOT IN \(([^)]+)\)/.exec(sql)?.[1] ?? "";
    const allowed = [...guard.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(allowed.sort()).toEqual([...PUBLIC_PRODUCT_EVENTS].sort());
  });
});

describe("isValidProductEvent", () => {
  it("accepts exact allowlisted properties", () => {
    expect(isValidProductEvent("expense_saved", { entry_mode: "quick", participant_bucket: "2" })).toBe(true);
    expect(isValidProductEvent("group_created", {})).toBe(true);
  });

  it("rejects unknown names, extra keys, missing keys and free text", () => {
    expect(isValidProductEvent("page_viewed", {})).toBe(false);
    expect(isValidProductEvent("group_created", { group_name: "Trip" })).toBe(false);
    expect(isValidProductEvent("expense_saved", { entry_mode: "quick" })).toBe(false);
    expect(isValidProductEvent("expense_saved", { entry_mode: "Dinner", participant_bucket: "2" })).toBe(false);
    expect(isValidProductEvent("expense_saved", { entry_mode: "quick", participant_bucket: 2 })).toBe(false);
  });
});

describe("createTracker", () => {
  it("records valid events with the platform and swallows sink failures", async () => {
    const record = vi.fn().mockRejectedValue(new Error("offline"));
    const track = createTracker({ record }, "ios");
    expect(() => track({ name: "group_created" })).not.toThrow();
    await Promise.resolve();
    expect(record).toHaveBeenCalledWith({ name: "group_created", properties: {}, platform: "ios" });
  });

  it("drops events whose properties are not allowlisted", () => {
    const record = vi.fn();
    const track = createTracker({ record }, "web");
    track({
      name: "expense_saved",
      properties: { entry_mode: "quick", participant_bucket: "2" },
    });
    // Bypass the type system the way a stray call site could.
    (track as (event: unknown) => void)({ name: "expense_saved", properties: { entry_mode: "Dinner" } });
    expect(record).toHaveBeenCalledTimes(1);
  });

  it("does not throw when the sink throws synchronously", () => {
    const track = createTracker(
      {
        record: () => {
          throw new Error("boom");
        },
      },
      "web",
    );
    expect(() => track({ name: "member_added" })).not.toThrow();
  });
});

describe("helpers", () => {
  it("buckets participant counts per the PRD", () => {
    expect([0, 1, 2, 3, 5, 6, 10, 11, 40].map(participantBucket)).toEqual([
      "1",
      "1",
      "2",
      "3-5",
      "3-5",
      "6-10",
      "6-10",
      "11+",
      "11+",
    ]);
  });

  it("classifies errors without carrying their text", () => {
    expect(errorClassFor(Object.assign(new Error("x"), { code: "PT409" }))).toBe("conflict");
    expect(errorClassFor(new Error("You are not a member of this group."))).toBe("permission");
    expect(errorClassFor(new TypeError("Failed to fetch"))).toBe("network");
    expect(errorClassFor(new Error("Payer amounts must sum to the total"))).toBe("validation");
    expect(errorClassFor("???")).toBe("unknown");
  });
});
