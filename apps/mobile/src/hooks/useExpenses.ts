import { onlineManager, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import {
  buildCustomExpenseRpcInput,
  buildEqualExpenseRpcInput,
  buildItemizedExpenseRpcInput,
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
): NewOutboxEntry {
  return {
    id: clientId,
    kind,
    entityId: clientId,
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
  itemName: string;
  amountCents: number;
  categoryId?: string | null;
  participantIds: string[];
  payers: { memberId: string; paidCents: number }[];
};

type UpdateExpenseCustomSplitParams = {
  expenseId: string;
  itemName: string;
  amountCents: number;
  categoryId?: string | null;
  customSplits: { memberId: string; shareCents: number }[];
  payers: { memberId: string; paidCents: number }[];
};

type UpdateItemizedExpenseParams = {
  expenseId: string;
  expenseName: string;
  amountCents: number;
  categoryId?: string | null;
  payers: { memberId: string; paidCents: number }[];
  lineItems: { name: string; amountCents: number; participantIds: string[] }[];
};

export function useUpdateExpense(groupId: string) {
  const invalidate = useExpenseMutationInvalidations(groupId);
  return useMutation({
    mutationFn: (params: UpdateExpenseParams) => updateExpense(params),
    onSuccess: invalidate,
  });
}

export function useUpdateExpenseCustomSplit(groupId: string) {
  const invalidate = useExpenseMutationInvalidations(groupId);
  return useMutation({
    mutationFn: (params: UpdateExpenseCustomSplitParams) => updateExpenseCustomSplit(params),
    onSuccess: invalidate,
  });
}

export function useUpdateItemizedExpense(groupId: string) {
  const invalidate = useExpenseMutationInvalidations(groupId);
  return useMutation({
    mutationFn: (params: UpdateItemizedExpenseParams) => updateItemizedExpense(params),
    onSuccess: invalidate,
  });
}

export function useDeleteExpense(groupId: string) {
  const invalidate = useExpenseMutationInvalidations(groupId);
  return useMutation({
    mutationFn: (expenseId: string) => deleteExpense(expenseId),
    onSuccess: invalidate,
  });
}
