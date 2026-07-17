import { onlineManager, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import {
  buildCustomExpenseRpcInput,
  buildEqualExpenseRpcInput,
  buildItemizedExpenseRpcInput,
  buildUpdateCustomExpenseRpcInput,
  buildUpdateEqualExpenseRpcInput,
  buildUpdateItemizedExpenseRpcInput,
  type Expense,
  type Json,
} from "@template/supabase";
import type { ApiResponse, NewOutboxEntry, OutboxJson } from "@template/shared";
import { useOutbox } from "@/context/OutboxContext";
import { addExpense, addExpenseCustomSplit, addItemizedExpense, deleteExpense, listExpenses, listExpenseTotals, updateExpense, updateExpenseCustomSplit, updateItemizedExpense } from "@/services/expenses";

type AddExpenseParams = {
  groupId: string;
  itemName: string;
  amountCents: number;
  categoryId?: string | null;
  memberIds: string[];
  payerMemberId: string;
  createdByUserId: string;
  expenseDate?: string;
};

type AddExpenseCustomSplitParams = {
  groupId: string;
  itemName: string;
  amountCents: number;
  categoryId?: string | null;
  customSplits: { memberId: string; shareCents: number }[];
  payers: { memberId: string; paidCents: number }[];
  expenseDate?: string;
};

type AddItemizedExpenseParams = {
  groupId: string;
  expenseName: string;
  amountCents: number;
  categoryId?: string | null;
  payers: { memberId: string; paidCents: number }[];
  lineItems: { name: string; amountCents: number; participantIds: string[] }[];
  expenseDate?: string;
};

export function useExpenses(groupId: string) {
  return useInfiniteQuery({
    queryKey: ["expenses", groupId],
    queryFn: async ({ pageParam }) => {
      const res = await listExpenses(groupId, pageParam);
      if (res.error || !res.data) throw new Error(res.error ?? "Failed to load expenses");
      return res.data;
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    enabled: !!groupId,
  });
}

/** All-rows count + positive total, so headers/budgets stay correct under pagination. */
export function useExpenseTotals(groupId: string) {
  return useQuery({
    queryKey: ["expense-totals", groupId],
    queryFn: async () => {
      const res = await listExpenseTotals(groupId);
      if (res.error || !res.data) throw new Error(res.error ?? "Failed to load expense totals");
      return res.data;
    },
    enabled: !!groupId,
  });
}

function useExpenseMutationInvalidations(groupId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["expenses", groupId] });
    void qc.invalidateQueries({ queryKey: ["expense-totals", groupId] });
    void qc.invalidateQueries({ queryKey: ["balances", groupId] });
    void qc.invalidateQueries({ queryKey: ["activity", groupId] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
    void qc.invalidateQueries({ queryKey: ["groups"] });
  };
}

// ---------------------------------------------------------------------------
// Offline create support: while offline, the exact RPC input the service
// would have sent is queued in the outbox under a client-generated UUID (the
// server-side idempotency key) and a locally-built Expense row is returned so
// callers behave exactly as on a successful save. The online path sends the
// same clientId, which also makes flaky-network retries duplicate-safe.
// ---------------------------------------------------------------------------

/** Strip undefined values so the queued payload survives JSON persistence. */
function toOutboxPayload(input: Json): OutboxJson {
  return JSON.parse(JSON.stringify(input)) as OutboxJson;
}

function localISODate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function makeLocalExpense(params: {
  id: string;
  groupId: string;
  categoryId?: string | null;
  itemName: string;
  amountCents: number;
  expenseDate?: string;
  createdByUserId?: string;
}): Expense {
  const nowISO = new Date().toISOString();
  return {
    id: params.id,
    group_id: params.groupId,
    category_id: params.categoryId ?? null,
    item_name: params.itemName,
    amount_cents: params.amountCents,
    notes: null,
    expense_date: params.expenseDate ?? localISODate(),
    created_by_user_id: params.createdByUserId ?? null,
    created_at: nowISO,
    updated_at: nowISO,
  };
}

function expenseOutboxEntry(
  clientId: string,
  kind: NewOutboxEntry["kind"],
  groupId: string,
  payload: Json,
  itemName: string,
  amountCents: number,
  /** Target row id — defaults to clientId (creates); pass the server id for edits. */
  entityId: string = clientId,
): NewOutboxEntry {
  return {
    id: clientId,
    kind,
    entityId,
    groupId,
    payload: toOutboxPayload(payload),
    createdAt: new Date().toISOString(),
    summary: { title: itemName, amountCents },
  };
}

export function useAddExpense(groupId: string) {
  const invalidate = useExpenseMutationInvalidations(groupId);
  const { enqueue } = useOutbox();
  return useMutation({
    mutationFn: async (params: AddExpenseParams): Promise<ApiResponse<Expense>> => {
      const clientId = Crypto.randomUUID();
      if (!onlineManager.isOnline()) {
        if (!params.itemName.trim()) return { data: null, error: "Item name is required" };
        if (params.amountCents <= 0) return { data: null, error: "Amount must be positive" };
        if (params.memberIds.length === 0) return { data: null, error: "Select at least one participant" };
        const payload = buildEqualExpenseRpcInput({
          clientId,
          groupId: params.groupId,
          categoryId: params.categoryId,
          itemName: params.itemName,
          amountCents: params.amountCents,
          expenseDate: params.expenseDate,
          participantIds: params.memberIds,
          payers: [{ memberId: params.payerMemberId, paidCents: params.amountCents }],
        });
        await enqueue(
          expenseOutboxEntry(clientId, "expense.create", params.groupId, payload, params.itemName.trim(), params.amountCents),
        );
        return { data: makeLocalExpense({ id: clientId, ...params }), error: null };
      }
      return addExpense({ ...params, clientId });
    },
    onSuccess: invalidate,
  });
}

export function useAddExpenseCustomSplit(groupId: string) {
  const invalidate = useExpenseMutationInvalidations(groupId);
  const { enqueue } = useOutbox();
  return useMutation({
    mutationFn: async (params: AddExpenseCustomSplitParams): Promise<ApiResponse<Expense>> => {
      const clientId = Crypto.randomUUID();
      if (!onlineManager.isOnline()) {
        if (!params.itemName.trim()) return { data: null, error: "Item name is required" };
        if (params.amountCents <= 0) return { data: null, error: "Amount must be positive" };
        const splitSum = params.customSplits.reduce((s, p) => s + p.shareCents, 0);
        if (splitSum !== params.amountCents) {
          return { data: null, error: `Split total (${splitSum}) must equal amount (${params.amountCents})` };
        }
        const payerSum = params.payers.reduce((s, p) => s + p.paidCents, 0);
        if (payerSum !== params.amountCents) {
          return { data: null, error: `Payer total (${payerSum}) must equal amount (${params.amountCents})` };
        }
        const payload = buildCustomExpenseRpcInput({
          clientId,
          groupId: params.groupId,
          categoryId: params.categoryId,
          itemName: params.itemName,
          amountCents: params.amountCents,
          expenseDate: params.expenseDate,
          customSplits: params.customSplits,
          payers: params.payers,
        });
        await enqueue(
          expenseOutboxEntry(clientId, "expense.create", params.groupId, payload, params.itemName.trim(), params.amountCents),
        );
        return { data: makeLocalExpense({ id: clientId, ...params }), error: null };
      }
      return addExpenseCustomSplit({ ...params, clientId });
    },
    onSuccess: invalidate,
  });
}

export function useAddItemizedExpense(groupId: string) {
  const invalidate = useExpenseMutationInvalidations(groupId);
  const { enqueue } = useOutbox();
  return useMutation({
    mutationFn: async (params: AddItemizedExpenseParams): Promise<ApiResponse<Expense>> => {
      const clientId = Crypto.randomUUID();
      if (!onlineManager.isOnline()) {
        if (!params.expenseName.trim()) return { data: null, error: "Expense name is required" };
        if (params.amountCents <= 0) return { data: null, error: "Amount must be positive" };
        if (params.lineItems.length === 0) return { data: null, error: "At least one line item is required" };
        const payload = buildItemizedExpenseRpcInput({
          clientId,
          groupId: params.groupId,
          categoryId: params.categoryId,
          itemName: params.expenseName,
          amountCents: params.amountCents,
          expenseDate: params.expenseDate,
          payers: params.payers,
          lineItems: params.lineItems,
        });
        await enqueue(
          expenseOutboxEntry(clientId, "expense.create_itemized", params.groupId, payload, params.expenseName.trim(), params.amountCents),
        );
        return {
          data: makeLocalExpense({ id: clientId, itemName: params.expenseName, ...params }),
          error: null,
        };
      }
      return addItemizedExpense({ ...params, clientId });
    },
    onSuccess: invalidate,
  });
}

type UpdateExpenseParams = {
  expenseId: string;
  /** CAS snapshot from the row being edited (expense.updated_at). */
  expectedUpdatedAt?: string;
  itemName: string;
  amountCents: number;
  categoryId?: string | null;
  participantIds: string[];
  payers: { memberId: string; paidCents: number }[];
};

type UpdateExpenseCustomSplitParams = {
  expenseId: string;
  /** CAS snapshot from the row being edited (expense.updated_at). */
  expectedUpdatedAt?: string;
  itemName: string;
  amountCents: number;
  categoryId?: string | null;
  customSplits: { memberId: string; shareCents: number }[];
  payers: { memberId: string; paidCents: number }[];
};

type UpdateItemizedExpenseParams = {
  expenseId: string;
  /** CAS snapshot from the row being edited (expense.updated_at). */
  expectedUpdatedAt?: string;
  expenseName: string;
  amountCents: number;
  categoryId?: string | null;
  payers: { memberId: string; paidCents: number }[];
  lineItems: { name: string; amountCents: number; participantIds: string[] }[];
};

// Offline edits queue under the SERVER expense id (entityId), chaining after
// any earlier queued change to the same expense. The CAS snapshot captured at
// edit time travels with the payload, so a replay that lands after someone
// else's edit fails with a surfaced conflict instead of clobbering it.

export function useUpdateExpense(groupId: string) {
  const invalidate = useExpenseMutationInvalidations(groupId);
  const { enqueue } = useOutbox();
  return useMutation({
    mutationFn: async (params: UpdateExpenseParams): Promise<ApiResponse<Expense>> => {
      if (!onlineManager.isOnline()) {
        if (!params.itemName.trim()) return { data: null, error: "Item name is required" };
        if (params.amountCents <= 0) return { data: null, error: "Amount must be positive" };
        if (params.participantIds.length === 0) return { data: null, error: "Select at least one participant" };
        const payload = buildUpdateEqualExpenseRpcInput({
          expenseId: params.expenseId,
          expectedUpdatedAt: params.expectedUpdatedAt,
          categoryId: params.categoryId,
          itemName: params.itemName,
          amountCents: params.amountCents,
          participantIds: params.participantIds,
          payers: params.payers,
        });
        await enqueue(
          expenseOutboxEntry(Crypto.randomUUID(), "expense.update", groupId, payload, params.itemName.trim(), params.amountCents, params.expenseId),
        );
        return {
          data: makeLocalExpense({ id: params.expenseId, groupId, ...params }),
          error: null,
        };
      }
      return updateExpense(params);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateExpenseCustomSplit(groupId: string) {
  const invalidate = useExpenseMutationInvalidations(groupId);
  const { enqueue } = useOutbox();
  return useMutation({
    mutationFn: async (params: UpdateExpenseCustomSplitParams): Promise<ApiResponse<Expense>> => {
      if (!onlineManager.isOnline()) {
        if (!params.itemName.trim()) return { data: null, error: "Item name is required" };
        if (params.amountCents <= 0) return { data: null, error: "Amount must be positive" };
        const payload = buildUpdateCustomExpenseRpcInput({
          expenseId: params.expenseId,
          expectedUpdatedAt: params.expectedUpdatedAt,
          categoryId: params.categoryId,
          itemName: params.itemName,
          amountCents: params.amountCents,
          customSplits: params.customSplits,
          payers: params.payers,
        });
        await enqueue(
          expenseOutboxEntry(Crypto.randomUUID(), "expense.update", groupId, payload, params.itemName.trim(), params.amountCents, params.expenseId),
        );
        return {
          data: makeLocalExpense({ id: params.expenseId, groupId, ...params }),
          error: null,
        };
      }
      return updateExpenseCustomSplit(params);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateItemizedExpense(groupId: string) {
  const invalidate = useExpenseMutationInvalidations(groupId);
  const { enqueue } = useOutbox();
  return useMutation({
    mutationFn: async (params: UpdateItemizedExpenseParams): Promise<ApiResponse<Expense>> => {
      if (!onlineManager.isOnline()) {
        if (!params.expenseName.trim()) return { data: null, error: "Expense name is required" };
        if (params.amountCents <= 0) return { data: null, error: "Amount must be positive" };
        if (params.lineItems.length === 0) return { data: null, error: "At least one line item is required" };
        const payload = buildUpdateItemizedExpenseRpcInput({
          expenseId: params.expenseId,
          expectedUpdatedAt: params.expectedUpdatedAt,
          categoryId: params.categoryId,
          itemName: params.expenseName,
          amountCents: params.amountCents,
          payers: params.payers,
          lineItems: params.lineItems,
        });
        await enqueue(
          expenseOutboxEntry(Crypto.randomUUID(), "expense.update_itemized", groupId, payload, params.expenseName.trim(), params.amountCents, params.expenseId),
        );
        return {
          data: makeLocalExpense({ id: params.expenseId, groupId, itemName: params.expenseName, ...params }),
          error: null,
        };
      }
      return updateItemizedExpense(params);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteExpense(groupId: string) {
  const invalidate = useExpenseMutationInvalidations(groupId);
  const { enqueue } = useOutbox();
  return useMutation({
    mutationFn: async (expenseId: string): Promise<ApiResponse<null>> => {
      if (!onlineManager.isOnline()) {
        // Deleting a not-yet-synced local create cancels the whole chain in
        // the outbox; a server row queues an idempotent delete (0 rows = ok).
        await enqueue({
          id: Crypto.randomUUID(),
          kind: "expense.delete",
          entityId: expenseId,
          groupId,
          payload: {},
          createdAt: new Date().toISOString(),
          summary: { title: "Delete expense", amountCents: 0 },
        });
        return { data: null, error: null };
      }
      return deleteExpense(expenseId);
    },
    onSuccess: invalidate,
  });
}
