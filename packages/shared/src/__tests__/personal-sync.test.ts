import { describe, expect, it } from "vitest";
import {
  addPersonalExpense,
  deletePersonalExpense,
  emptyPersonalLedger,
  updatePersonalExpense,
} from "../utils/personal-ledger";
import {
  applyPushResults,
  guestImportComplete,
  importGuestExpenses,
  pullCursor,
  mergePulledRows,
  pendingPersonalExpenses,
  toPushRow,
  unimportedGuestExpenses,
  type ServerPersonalExpense,
} from "../utils/personal-sync";
import type { PersonalExpenseInput } from "../types/personal";

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = (over: Partial<PersonalExpenseInput> = {}): PersonalExpenseInput => ({
  description: "Coffee",
  amountMinor: 18000,
  currency: "PHP",
  category: "food-drinks",
  date: "2026-10-01",
  source: "manual",
  ...over,
});
const at = (minute: number) => ({ now: `2026-10-01T08:${String(minute).padStart(2, "0")}:00.000Z`, tracksSync: true });
const server = (n: number, updated: string, over: Partial<ServerPersonalExpense> = {}): ServerPersonalExpense => ({
  id: id(n),
  description: "Coffee",
  amount_minor: 18000,
  currency_code: "PHP",
  category_slug: "food-drinks",
  expense_date: "2026-10-01",
  notes: null,
  merchant: null,
  source: "manual",
  client_created_at: "2026-10-01T08:00:00.000Z",
  client_updated_at: "2026-10-01T08:00:00.000Z",
  deleted_at: null,
  updated_at: updated,
  ...over,
});

describe("push", () => {
  it("marks acknowledged versions synced and keeps edits made during the request pending", () => {
    let state = addPersonalExpense(emptyPersonalLedger(), id(1), input(), at(0));
    state = addPersonalExpense(state, id(2), input({ description: "Tea" }), at(1));
    const sent = pendingPersonalExpenses(state);
    expect(sent.map((e) => e.id)).toEqual([id(1), id(2)]);
    expect(toPushRow(sent[0]!)).toMatchObject({ amount_minor: 18000, deleted: false, base_updated_at: null });

    // Record 2 is edited while the push is in flight.
    state = updatePersonalExpense(state, id(2), input({ description: "Milk tea" }), at(2));
    state = applyPushResults(state, sent, [
      { id: id(1), status: "applied", row: server(1, "2026-10-01T08:05:00.000Z") },
      { id: id(2), status: "applied", row: server(2, "2026-10-01T08:05:01.000Z") },
    ]);
    expect(state.expenses[0]).toMatchObject({ sync: "synced", serverUpdatedAt: "2026-10-01T08:05:00.000Z" });
    expect(state.expenses[1]).toMatchObject({
      sync: "pending",
      description: "Milk tea",
      serverUpdatedAt: "2026-10-01T08:05:01.000Z",
    });
    // Upload acknowledgements never move the pull cursor.
    expect(pullCursor(state)).toBeNull();
  });

  it("adopts the server row when the server kept its version", () => {
    let state = addPersonalExpense(emptyPersonalLedger(), id(1), input(), at(0));
    const sent = pendingPersonalExpenses(state);
    state = applyPushResults(state, sent, [
      { id: id(1), status: "kept_server", row: server(1, "2026-10-01T09:00:00.000Z", { deleted_at: "2026-10-01T09:00:00.000Z" }) },
    ]);
    expect(state.expenses[0]).toMatchObject({ sync: "synced", deletedAt: "2026-10-01T09:00:00.000Z" });
  });

  it("stops retrying a rejected id without losing the record", () => {
    let state = addPersonalExpense(emptyPersonalLedger(), id(1), input(), at(0));
    state = applyPushResults(state, pendingPersonalExpenses(state), [{ id: id(1), status: "rejected", row: null }]);
    expect(state.expenses).toHaveLength(1);
    expect(state.expenses[0]?.sync).toBe("local");
    expect(pendingPersonalExpenses(state)).toHaveLength(0);
  });
});

describe("pull", () => {
  it("adds and updates synced records but never overwrites unsent local edits", () => {
    let state = addPersonalExpense(emptyPersonalLedger(), id(1), input(), at(0));
    state = applyPushResults(state, pendingPersonalExpenses(state), [
      { id: id(1), status: "applied", row: server(1, "2026-10-01T08:05:00.000Z") },
    ]);
    state = addPersonalExpense(state, id(2), input({ description: "Local only" }), at(6));

    state = mergePulledRows(state, [
      server(1, "2026-10-01T08:10:00.000Z", { description: "Coffee (edited on iPad)" }),
      server(2, "2026-10-01T08:11:00.000Z", { description: "Server copy" }),
      server(3, "2026-10-01T08:12:00.000Z", { description: "From another device" }),
    ]);
    const byId = new Map(state.expenses.map((e) => [e.id, e]));
    expect(byId.get(id(1))?.description).toBe("Coffee (edited on iPad)");
    expect(byId.get(id(2))).toMatchObject({ description: "Local only", sync: "pending" });
    expect(byId.get(id(3))).toMatchObject({ description: "From another device", sync: "synced" });
    expect(pullCursor(state)).toBe("2026-10-01T08:12:00.000Z");
  });

  it("ignores rows older than the local synced version", () => {
    let state = addPersonalExpense(emptyPersonalLedger(), id(1), input({ description: "New" }), at(0));
    state = applyPushResults(state, pendingPersonalExpenses(state), [
      { id: id(1), status: "applied", row: server(1, "2026-10-01T08:10:00.000Z", { description: "New" }) },
    ]);
    state = mergePulledRows(state, [server(1, "2026-10-01T08:05:00.000Z", { description: "Old" })]);
    expect(state.expenses[0]?.description).toBe("New");
  });
});

describe("guest import", () => {
  let guest = addPersonalExpense(emptyPersonalLedger(), id(1), input(), { now: "2026-10-01T08:00:00.000Z", tracksSync: false });
  guest = addPersonalExpense(guest, id(2), input({ description: "Tea" }), { now: "2026-10-01T08:01:00.000Z", tracksSync: false });
  guest = addPersonalExpense(guest, id(3), input({ description: "Deleted" }), { now: "2026-10-01T08:02:00.000Z", tracksSync: false });
  guest = deletePersonalExpense(guest, id(3), { now: "2026-10-01T08:03:00.000Z", tracksSync: false });

  it("imports live guest expenses once, keeping ids, and skips deleted ones", () => {
    let account = addPersonalExpense(emptyPersonalLedger(), id(9), input({ description: "Existing" }), at(0));
    expect(unimportedGuestExpenses(guest, account)).toHaveLength(2);
    account = importGuestExpenses(account, guest);
    account = importGuestExpenses(account, guest); // repeated import (crash, retry)
    expect(account.expenses.map((e) => e.id).sort()).toEqual([id(1), id(2), id(9)]);
    expect(account.expenses.filter((e) => e.id !== id(9)).every((e) => e.sync === "pending")).toBe(true);
    expect(unimportedGuestExpenses(guest, account)).toHaveLength(0);
  });

  it("is complete only after the server acknowledged every imported expense", () => {
    let account = importGuestExpenses(emptyPersonalLedger(), guest);
    expect(guestImportComplete(guest, account)).toBe(false);
    const sent = pendingPersonalExpenses(account);
    account = applyPushResults(account, sent, [
      { id: id(1), status: "applied", row: server(1, "2026-10-01T09:00:00.000Z") },
    ]);
    expect(guestImportComplete(guest, account)).toBe(false);
    account = applyPushResults(account, sent, [
      { id: id(2), status: "applied", row: server(2, "2026-10-01T09:00:01.000Z", { description: "Tea" }) },
    ]);
    expect(guestImportComplete(guest, account)).toBe(true);
  });
});

describe("journey B: guest with 50 expenses creates an account", () => {
  it("imports all 50 once, survives an interrupted upload, and only then frees the guest copy", () => {
    let guest = emptyPersonalLedger();
    for (let n = 1; n <= 50; n++) {
      guest = addPersonalExpense(
        guest,
        id(n),
        input({ description: `Expense ${n}`, amountMinor: n * 100, currency: n % 2 ? "PHP" : "USD" }),
        { now: `2026-09-${String((n % 28) + 1).padStart(2, "0")}T08:00:00.000Z`, tracksSync: false },
      );
    }
    // Import twice (e.g. the app was killed and the prompt answered again): no duplicates.
    let account = importGuestExpenses(importGuestExpenses(emptyPersonalLedger(), guest), guest);
    expect(account.expenses).toHaveLength(50);
    expect(new Set(account.expenses.map((e) => e.id)).size).toBe(50);

    // First upload batch succeeds, the connection drops before the second.
    const batch1 = pendingPersonalExpenses(account, 30);
    account = applyPushResults(
      account,
      batch1,
      batch1.map((e) => ({ id: e.id, status: "applied" as const, row: server(Number(e.id.slice(-12)), "2026-10-01T10:00:00.000Z", { id: e.id }) })),
    );
    expect(guestImportComplete(guest, account)).toBe(false);
    expect(pendingPersonalExpenses(account, 100)).toHaveLength(20);

    // Retry uploads only what is left; then the guest copy may go.
    const batch2 = pendingPersonalExpenses(account, 50);
    account = applyPushResults(
      account,
      batch2,
      batch2.map((e) => ({ id: e.id, status: "applied" as const, row: server(Number(e.id.slice(-12)), "2026-10-01T10:05:00.000Z", { id: e.id }) })),
    );
    expect(pendingPersonalExpenses(account, 100)).toHaveLength(0);
    expect(guestImportComplete(guest, account)).toBe(true);
    // Amounts and currencies are exactly what the guest saved.
    const byId = new Map(account.expenses.map((e) => [e.id, e]));
    for (const original of guest.expenses) {
      expect(byId.get(original.id)).toMatchObject({ amountMinor: original.amountMinor, currency: original.currency });
    }
  });
});
