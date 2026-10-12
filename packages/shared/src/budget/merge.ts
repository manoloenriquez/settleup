import { budgetDocumentSchema, budgetStoreSchema } from "./schema";
import type { BudgetAnnotation, BudgetDocument, BudgetStore } from "./types";

// ---------------------------------------------------------------------------
// Sync bookkeeping for the budget document, as pure state transitions.
//
// The device keeps `base`, the last document the server acknowledged. When
// the server has a newer copy, local changes made since `base` are replayed
// on top of it (three-way merge). What changed here arrived later, so it wins;
// everything else takes the server's version. Device clocks are never
// compared. Plan versions are append-only and simply unioned.
// ---------------------------------------------------------------------------

export function emptyBudgetStore(tracksSync: boolean): BudgetStore {
  return { version: 1, doc: null, base: null, sync: tracksSync ? "synced" : "local", serverUpdatedAt: null };
}

/** Parse a stored envelope; throws so an unreadable store is kept, never overwritten. */
export function parseBudgetStore(raw: unknown, tracksSync: boolean): BudgetStore {
  if (raw === null || raw === undefined) return emptyBudgetStore(tracksSync);
  const result = budgetStoreSchema.safeParse(raw);
  if (!result.success) throw new Error("Your saved budget on this device could not be read. It has been kept.");
  return result.data;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function mergeBudgetDocuments(
  base: BudgetDocument | null,
  local: BudgetDocument,
  server: BudgetDocument,
): BudgetDocument {
  // Two different budgets (set up on two devices before either synced): the
  // account's existing one is kept.
  if (local.id !== server.id) return server;

  const plans = new Map(server.plans.map((p) => [p.id, p]));
  for (const plan of local.plans) if (!plans.has(plan.id)) plans.set(plan.id, plan);

  const baseNotes = new Map((base?.annotations ?? []).map((a) => [a.id, a]));
  const localNotes = new Map(local.annotations.map((a) => [a.id, a]));
  const merged = new Map<string, BudgetAnnotation>(server.annotations.map((a) => [a.id, a]));
  for (const [id, note] of localNotes) {
    const before = baseNotes.get(id);
    const changedHere = !before || !same(before, note);
    if (changedHere || !merged.has(id)) merged.set(id, note);
  }

  const pick = <K extends "startDate" | "deletedAt">(key: K): BudgetDocument[K] =>
    base && same(base[key], local[key]) ? server[key] : local[key];

  return budgetDocumentSchema.parse({
    ...server,
    startDate: pick("startDate"),
    deletedAt: pick("deletedAt"),
    plans: [...plans.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
    annotations: [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
  });
}

/** A change made on this device. */
export function storeWithLocalChange(store: BudgetStore, doc: BudgetDocument): BudgetStore {
  return { ...store, doc, sync: store.sync === "local" ? "local" : "pending" };
}

/** The server accepted exactly `sent`. A change made meanwhile stays pending on the new base. */
export function storeAfterSave(store: BudgetStore, sent: BudgetDocument, serverUpdatedAt: string): BudgetStore {
  const unchanged = store.doc !== null && same(store.doc, sent);
  return { ...store, base: sent, serverUpdatedAt, sync: unchanged ? "synced" : "pending" };
}

/**
 * The server has `server` at `serverUpdatedAt` (from a pull or a refused
 * save). Unsent local changes are merged on top; otherwise the server's copy
 * is adopted.
 */
export function storeWithServerCopy(store: BudgetStore, server: BudgetDocument | null, serverUpdatedAt: string | null): BudgetStore {
  if (server === null) {
    // Nothing on the server: whatever is here still has to be uploaded.
    return { ...store, base: null, serverUpdatedAt: null, sync: store.doc ? "pending" : "synced" };
  }
  if (store.doc === null || store.sync !== "pending") {
    return { ...store, doc: server, base: server, serverUpdatedAt, sync: "synced" };
  }
  const merged = mergeBudgetDocuments(store.base, store.doc, server);
  return {
    ...store,
    doc: merged,
    base: server,
    serverUpdatedAt,
    sync: same(merged, server) ? "synced" : "pending",
  };
}

/** Guest budget into an empty account store: same document id, so a retry never makes a second budget. */
export function storeWithImportedGuest(store: BudgetStore, guest: BudgetDocument): BudgetStore {
  if (store.doc !== null) return store;
  return { ...store, doc: guest, base: null, serverUpdatedAt: null, sync: "pending" };
}
