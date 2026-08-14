import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OutboxEntry } from "@template/shared";

type RpcCall = { name: string; args: unknown };
type TableCall = { table: string; op: string; args: unknown };

const rpcCalls: RpcCall[] = [];
const tableCalls: TableCall[] = [];
let nextError: { code: string; message: string } | null = null;

vi.mock("@/lib/supabase/client", () => {
  const result = () => Promise.resolve({ data: null, error: nextError });
  return {
    supabase: {
      schema: () => ({
        rpc: (name: string, args: unknown) => {
          rpcCalls.push({ name, args });
          return { abortSignal: () => result() };
        },
        from: (table: string) => ({
          delete: () => ({
            eq: (column: string, value: unknown) => {
              tableCalls.push({ table, op: "delete", args: { column, value } });
              return { abortSignal: () => result() };
            },
          }),
          insert: (row: unknown) => {
            tableCalls.push({ table, op: "insert", args: row });
            return { abortSignal: () => result() };
          },
        }),
      }),
    },
  };
});

import { outboxExecutor } from "../outbox/executor";

function entry(overrides: Partial<OutboxEntry>): OutboxEntry {
  return {
    id: "id-1",
    kind: "expense.create",
    entityId: "entity-1",
    groupId: "group-1",
    payload: { item_name: "Coffee" },
    status: "inflight",
    attempts: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    nextAttemptAt: null,
    lastError: null,
    summary: { title: "Coffee", amountCents: 500 },
    ...overrides,
  };
}

beforeEach(() => {
  rpcCalls.length = 0;
  tableCalls.length = 0;
  nextError = null;
});

describe("web outboxExecutor kind → Supabase call mapping", () => {
  it("routes creates and updates to the matching RPC with the stored payload", async () => {
    const cases: Array<[OutboxEntry["kind"], string]> = [
      ["expense.create", "create_expense"],
      ["expense.create_itemized", "create_itemized_expense"],
      ["expense.update", "update_expense"],
      ["expense.update_itemized", "update_itemized_expense"],
    ];
    for (const [kind, rpcName] of cases) {
      const result = await outboxExecutor(entry({ kind }));
      expect(result).toEqual({ ok: true });
      expect(rpcCalls.at(-1)).toEqual({ name: rpcName, args: { p_input: { item_name: "Coffee" } } });
    }
  });

  it("records payments through record_payment with the entity id as p_id", async () => {
    const result = await outboxExecutor(
      entry({
        kind: "payment.record",
        entityId: "pay-1",
        payload: { group_id: "g", from_member_id: "a", to_member_id: "b", amount_cents: 500 },
      }),
    );
    expect(result).toEqual({ ok: true });
    expect(rpcCalls.at(-1)).toEqual({
      name: "record_payment",
      args: { p_group_id: "g", p_from_member_id: "a", p_to_member_id: "b", p_amount_cents: 500, p_id: "pay-1" },
    });
  });

  it("deletes expenses directly by entity id (0 rows affected = success)", async () => {
    const result = await outboxExecutor(entry({ kind: "expense.delete", entityId: "exp-9" }));
    expect(result).toEqual({ ok: true });
    expect(tableCalls.at(-1)).toEqual({
      table: "expenses",
      op: "delete",
      args: { column: "id", value: "exp-9" },
    });
  });

  it("inserts comments with a client-supplied primary key", async () => {
    const result = await outboxExecutor(
      entry({
        kind: "comment.create",
        entityId: "comment-1",
        payload: { expense_id: "e", author_user_id: "u", body: "hi" },
      }),
    );
    expect(result).toEqual({ ok: true });
    expect(tableCalls.at(-1)).toEqual({
      table: "expense_comments",
      op: "insert",
      args: { id: "comment-1", expense_id: "e", author_user_id: "u", body: "hi" },
    });
  });

  it("surfaces Supabase errors as { ok: false, code, message } for the engine to classify", async () => {
    nextError = { code: "PT409", message: "Client id conflict" };
    const result = await outboxExecutor(entry({}));
    expect(result).toEqual({ ok: false, code: "PT409", message: "Client id conflict" });
  });
});

describe("group / category / payment-resolution kinds", () => {
  it("creates groups via create_group_with_owner with the entity id as p_id", async () => {
    const result = await outboxExecutor(
      entry({ kind: "group.create", entityId: "grp-1", payload: { name: "Trip" } }),
    );
    expect(result).toEqual({ ok: true });
    expect(rpcCalls.at(-1)).toEqual({
      name: "create_group_with_owner",
      args: { p_name: "Trip", p_id: "grp-1" },
    });
  });

  it("creates categories with the entity id as p_id and the group id from the entry", async () => {
    const result = await outboxExecutor(
      entry({
        kind: "category.create",
        entityId: "cat-1",
        groupId: "group-1",
        payload: { name: "Food", icon: "utensils", color: "#ff0000" },
      }),
    );
    expect(result).toEqual({ ok: true });
    expect(rpcCalls.at(-1)).toEqual({
      name: "create_expense_category",
      args: { p_group_id: "group-1", p_name: "Food", p_icon: "utensils", p_color: "#ff0000", p_id: "cat-1" },
    });
  });

  it("updates categories with the CAS token from the payload", async () => {
    const result = await outboxExecutor(
      entry({
        kind: "category.update",
        entityId: "cat-1",
        payload: { name: "Food", icon: "utensils", color: "#ff0000", sort_order: 10, expected_updated_at: "2026-01-01T00:00:00Z" },
      }),
    );
    expect(result).toEqual({ ok: true });
    expect(rpcCalls.at(-1)).toEqual({
      name: "update_expense_category",
      args: {
        p_category_id: "cat-1",
        p_name: "Food",
        p_icon: "utensils",
        p_color: "#ff0000",
        p_sort_order: 10,
        p_expected_updated_at: "2026-01-01T00:00:00Z",
      },
    });
  });

  it("deletes categories and resolves payments by entity id", async () => {
    await outboxExecutor(entry({ kind: "category.delete", entityId: "cat-9" }));
    expect(rpcCalls.at(-1)).toEqual({ name: "delete_expense_category", args: { p_category_id: "cat-9" } });

    await outboxExecutor(entry({ kind: "payment.confirm", entityId: "pay-1", payload: {} }));
    expect(rpcCalls.at(-1)).toEqual({ name: "confirm_payment", args: { p_payment_id: "pay-1" } });

    await outboxExecutor(entry({ kind: "payment.reject", entityId: "pay-2", payload: {} }));
    expect(rpcCalls.at(-1)).toEqual({ name: "reject_payment", args: { p_payment_id: "pay-2" } });
  });
});
