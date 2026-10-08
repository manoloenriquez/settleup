import { describe, expect, it } from "vitest";
import { accountOutboxKey } from "@template/shared";
import { inactiveAccountKeys, isEmptyOutbox, isFullySyncedLedger } from "../account-data";

const project = "https://p.invalid";
const queryPrefix = `tabkind:query-cache:${encodeURIComponent(project)}:`;
const q = (owner: string): string => `${queryPrefix}${encodeURIComponent(owner)}`;

describe("inactiveAccountKeys", () => {
  const keys = [
    q("alice"),
    q("bob"),
    q("signed-out"),
    accountOutboxKey(project, "alice"),
    accountOutboxKey(project, "bob"),
    accountOutboxKey(project, "carol"),
    accountOutboxKey("https://other.invalid", "bob"),
    "tabkind:query-cache:https%3A%2F%2Fother.invalid:bob",
    "talli:prefs:v1",
  ];

  it("keeps the current account and removes other accounts' caches and empty queues", () => {
    const empty = new Set([accountOutboxKey(project, "bob")]);
    const result = inactiveAccountKeys(keys, project, "alice", (k) => empty.has(k), queryPrefix);
    expect(result).toEqual([q("bob"), q("signed-out"), accountOutboxKey(project, "bob")]);
  });

  it("removes other accounts' assistant conversations, keeps the current one and the guest's", () => {
    const prefix = "talli:assistant:v1:account:";
    const mine = `${prefix}p:alice`;
    const theirs = `${prefix}p:bob`;
    const result = inactiveAccountKeys(
      [mine, theirs, "talli:assistant:v1:guest"],
      project,
      "alice",
      () => true,
      queryPrefix,
      undefined,
      { prefix, currentKey: mine },
    );
    expect(result).toEqual([theirs]);
    // Signed out: every account conversation goes, the guest's stays.
    expect(
      inactiveAccountKeys([mine, theirs, "talli:assistant:v1:guest"], project, null, () => true, queryPrefix, undefined, { prefix, currentKey: null }),
    ).toEqual([mine, theirs]);
  });

  it("never removes a queue that still has changes", () => {
    const result = inactiveAccountKeys(keys, project, null, () => false, queryPrefix);
    expect(result).not.toContain(accountOutboxKey(project, "carol"));
    expect(result).toContain(q("alice"));
  });

  it("leaves other projects and unrelated keys alone", () => {
    const result = inactiveAccountKeys(keys, project, null, () => true, queryPrefix);
    expect(result).not.toContain("talli:prefs:v1");
    expect(result).not.toContain(accountOutboxKey("https://other.invalid", "bob"));
    expect(result).not.toContain("tabkind:query-cache:https%3A%2F%2Fother.invalid:bob");
  });
});

describe("isEmptyOutbox", () => {
  it("treats only a readable, explicitly empty queue as empty", () => {
    expect(isEmptyOutbox(null)).toBe(true);
    expect(isEmptyOutbox(JSON.stringify({ version: 2, ownerId: "a", state: { entries: [] } }))).toBe(true);
    expect(isEmptyOutbox(JSON.stringify({ version: 2, ownerId: "a", state: null }))).toBe(false);
    expect(isEmptyOutbox(JSON.stringify({ version: 2, ownerId: "a" }))).toBe(false);
    expect(isEmptyOutbox("not json")).toBe(false);
    expect(isEmptyOutbox(JSON.stringify({ state: { entries: "corrupt" } }))).toBe(false);
  });
});

describe("personal stores", () => {
  const prefix = "talli:personal:v1:account:p:";
  const keys = [`${prefix}alice`, `${prefix}bob`, `${prefix}carol`, "talli:personal:v1:guest"];
  it("removes other accounts' fully synced stores only, never the guest store", () => {
    const synced = new Set([`${prefix}bob`]);
    const result = inactiveAccountKeys(keys, project, "alice", () => false, queryPrefix, {
      prefix,
      currentKey: `${prefix}alice`,
      isSynced: (key) => synced.has(key),
    });
    expect(result).toEqual([`${prefix}bob`]);
  });

  it("treats pending, local or unreadable records as not synced", () => {
    expect(isFullySyncedLedger(JSON.stringify({ version: 1, expenses: [{ sync: "synced" }] }))).toBe(true);
    expect(isFullySyncedLedger(JSON.stringify({ version: 1, expenses: [{ sync: "pending" }] }))).toBe(false);
    expect(isFullySyncedLedger(JSON.stringify({ version: 1, expenses: [{ sync: "local" }] }))).toBe(false);
    expect(isFullySyncedLedger("{")).toBe(false);
    expect(isFullySyncedLedger(null)).toBe(true);
  });
});
