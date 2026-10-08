import type { CurrencyCode } from "@template/shared";
import {
  onlineManager,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
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
import {
  addExpense,
  addExpenseCustomSplit,
  addItemizedExpense,
  deleteExpense,
  listExpenses,
  listExpenseTotals,
  updateExpense,
  updateExpenseCustomSplit,
  updateItemizedExpense,
} from "@/services/expenses";

type AddExpenseParams = {
  notes?: string;
  groupId: string;
  itemName: string;
  amountCents: number;
  currencyCode: CurrencyCode;
  categoryId?: string | null;
  memberIds: string[];
  payerMemberId: string;
  createdByUserId: string;
  expenseDate?: string;
};

type AddExpenseCustomSplitParams = {
  notes?: string;
  groupId: string;
  itemName: string;
  amountCents: number;
  currencyCode: CurrencyCode;
  categoryId?: string | null;
  customSplits: { memberId: string; shareCents: number }[];
  payers: { memberId: string; paidCents: number }[];
  expenseDate?: string;
};

type AddItemizedExpenseParams = {
  notes?: string;
  groupId: string;
  expenseName: string;
  amountCents: number;
  currencyCode: CurrencyCode;
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

export type EnqueueFn = (entry: NewOutboxEntry) => Promise<unknown>;

/** Every query an expense write can change, for one group. */
export function invalidateExpenseQueries(qc: QueryClient, groupId: string): void {
  void qc.invalidateQueries({ queryKey: ["expenses", groupId] });
  void qc.invalidateQueries({ queryKey: ["expense-totals", groupId] });
  void qc.invalidateQueries({ queryKey: ["balances", groupId] });
  void qc.invalidateQueries({ queryKey: ["activity", groupId] });
  void qc.invalidateQueries({ queryKey: ["dashboard"] });
  void qc.invalidateQueries({ queryKey: ["groups"] });
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
  currencyCode: CurrencyCode;
  expenseDate?: string;
  createdByUserId?: string;
  notes?: string;
}): Expense {
  const nowISO = new Date().toISOString();
  return {
    id: params.id,
    group_id: params.groupId,
    category_id: params.categoryId ?? null,
    item_name: params.itemName,
    currency_code: params.currencyCode ?? "PHP",
    amount_cents: params.amountCents,
    notes: params.notes?.trim() || null,
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

export async function addExpenseOrQueue(
  params: AddExpenseParams,
  enqueue: EnqueueFn,
  /** Idempotency key; pass a stable one to make retries replay instead of duplicating. */
  clientId: string = Crypto.randomUUID(),
): Promise<ApiResponse<Expense>> {
  if (!onlineManager.isOnline()) {
    if (!params.itemName.trim()) return { data: null, error: "Item name is required" };
    if (params.amountCents <= 0) return { data: null, error: "Amount must be positive" };
    if (params.memberIds.length === 0)
      return { data: null, error: "Select at least one participant" };
    const payload = buildEqualExpenseRpcInput({
      notes: params.notes,
      clientId,
      groupId: params.groupId,
      categoryId: params.categoryId,
      itemName: params.itemName,
      amountCents: params.amountCents,
      currencyCode: params.currencyCode,
      expenseDate: params.expenseDate,
      participantIds: params.memberIds,
      payers: [{ memberId: params.payerMemberId, paidCents: params.amountCents }],
    });
    await enqueue(
      expenseOutboxEntry(
        clientId,
        "expense.create",
        params.groupId,
        payload,
        params.itemName.trim(),
        params.amountCents,
      ),
    );
    return { data: makeLocalExpense({ id: clientId, ...params }), error: null };
  }
  return addExpense({ ...params, clientId });
}

export function useAddExpense(groupId: string) {
  const invalidate = useExpenseMutationInvalidations(groupId);
  const { enqueue } = useOutbox();
  return useMutation({
    mutationFn: (params: AddExpenseParams & { clientId?: string }) => addExpenseOrQueue(params, enqueue, params.clientId),
    onSuccess: invalidate,
  });
}

export async function addExpenseCustomSplitOrQueue(
  params: AddExpenseCustomSplitParams,
  enqueue: EnqueueFn,
  /** Idempotency key; pass a stable one to make retries replay instead of duplicating. */
  clientId: string = Crypto.randomUUID(),
): Promise<ApiResponse<Expense>> {
  if (!onlineManager.isOnline()) {
    if (!params.itemName.trim()) return { data: null, error: "Item name is required" };
    if (params.amountCents <= 0) return { data: null, error: "Amount must be positive" };
    const splitSum = params.customSplits.reduce((s, p) => s + p.shareCents, 0);
    if (splitSum !== params.amountCents) {
      return {
        data: null,
        error: `Split total (${splitSum}) must equal amount (${params.amountCents})`,
      };
    }
    const payerSum = params.payers.reduce((s, p) => s + p.paidCents, 0);
    if (payerSum !== params.amountCents) {
      return {
        data: null,
        error: `Payer total (${payerSum}) must equal amount (${params.amountCents})`,
      };
    }
    const payload = buildCustomExpenseRpcInput({
      notes: params.notes,
      clientId,
      groupId: params.groupId,
      categoryId: params.categoryId,
      itemName: params.itemName,
      amountCents: params.amountCents,
      currencyCode: params.currencyCode,
      expenseDate: params.expenseDate,
      customSplits: params.customSplits,
      payers: params.payers,
    });
    await enqueue(
      expenseOutboxEntry(
        clientId,
        "expense.create",
        params.groupId,
        payload,
        params.itemName.trim(),
        params.amountCents,
      ),
    );
    return { data: makeLocalExpense({ id: clientId, ...params }), error: null };
  }
  return addExpenseCustomSplit({ ...params, clientId });
}

export function useAddExpenseCustomSplit(groupId: string) {
  const invalidate = useExpenseMutationInvalidations(groupId);
  const { enqueue } = useOutbox();
  return useMutation({
    mutationFn: (params: AddExpenseCustomSplitParams & { clientId?: string }) => addExpenseCustomSplitOrQueue(params, enqueue, params.clientId),
    onSuccess: invalidate,
  });
}

export async function addItemizedExpenseOrQueue(
  params: AddItemizedExpenseParams,
  enqueue: EnqueueFn,
  /** Idempotency key; pass a stable one to make retries replay instead of duplicating. */
  clientId: string = Crypto.randomUUID(),
): Promise<ApiResponse<Expense>> {
  if (!onlineManager.isOnline()) {
    if (!params.expenseName.trim()) return { data: null, error: "Expense name is required" };
    if (params.amountCents <= 0) return { data: null, error: "Amount must be positive" };
    if (params.lineItems.length === 0)
      return { data: null, error: "At least one line item is required" };
    const payload = buildItemizedExpenseRpcInput({
      notes: params.notes,
      clientId,
      groupId: params.groupId,
      categoryId: params.categoryId,
      itemName: params.expenseName,
      amountCents: params.amountCents,
      currencyCode: params.currencyCode,
      expenseDate: params.expenseDate,
      payers: params.payers,
      lineItems: params.lineItems,
    });
    await enqueue(
      expenseOutboxEntry(
        clientId,
        "expense.create_itemized",
        params.groupId,
        payload,
        params.expenseName.trim(),
        params.amountCents,
      ),
    );
    return {
      data: makeLocalExpense({ id: clientId, itemName: params.expenseName, ...params }),
      error: null,
    };
  }
  return addItemizedExpense({ ...params, clientId });
}

export function useAddItemizedExpense(groupId: string) {
  const invalidate = useExpenseMutationInvalidations(groupId);
  const { enqueue } = useOutbox();
  return useMutation({
    mutationFn: (params: AddItemizedExpenseParams & { clientId?: string }) => addItemizedExpenseOrQueue(params, enqueue, params.clientId),
    onSuccess: invalidate,
  });
}

type UpdateExpenseParams = {
  notes?: string;
  expenseId: string;
  /** CAS snapshot from the row being edited (expense.updated_at). */
  expectedUpdatedAt?: string;
  itemName: string;
  amountCents: number;
  currencyCode: CurrencyCode;
  /** ISO date (YYYY-MM-DD); omitted keeps the stored date. */
  expenseDate?: string;
  categoryId?: string | null;
  participantIds: string[];
  payers: { memberId: string; paidCents: number }[];
};

type UpdateExpenseCustomSplitParams = {
  notes?: string;
  expenseId: string;
  /** CAS snapshot from the row being edited (expense.updated_at). */
  expectedUpdatedAt?: string;
  itemName: string;
  amountCents: number;
  currencyCode: CurrencyCode;
  /** ISO date (YYYY-MM-DD); omitted keeps the stored date. */
  expenseDate?: string;
  categoryId?: string | null;
  customSplits: { memberId: string; shareCents: number }[];
  payers: { memberId: string; paidCents: number }[];
};

type UpdateItemizedExpenseParams = {
  notes?: string;
  expenseId: string;
  /** CAS snapshot from the row being edited (expense.updated_at). */
  expectedUpdatedAt?: string;
  expenseName: string;
  amountCents: number;
  currencyCode: CurrencyCode;
  /** ISO date (YYYY-MM-DD); omitted keeps the stored date. */
  expenseDate?: string;
  categoryId?: string | null;
  payers: { memberId: string; paidCents: number }[];
  lineItems: { name: string; amountCents: number; participantIds: string[] }[];
};

// Offline edits queue under the SERVER expense id (entityId), chaining after
// any earlier queued change to the same expense. The CAS snapshot captured at
// edit time travels with the payload, so a replay that lands after someone
// else's edit fails with a surfaced conflict instead of clobbering it.

export async function updateExpenseOrQueue(
  groupId: string,
  params: UpdateExpenseParams,
  enqueue: EnqueueFn,
): Promise<ApiResponse<Expense>> {
  if (!onlineManager.isOnline()) {
    if (!params.itemName.trim()) return { data: null, error: "Item name is required" };
    if (params.amountCents <= 0) return { data: null, error: "Amount must be positive" };
    if (params.participantIds.length === 0)
      return { data: null, error: "Select at least one participant" };
    const payload = buildUpdateEqualExpenseRpcInput({
      notes: params.notes,
      expenseId: params.expenseId,
      expectedUpdatedAt: params.expectedUpdatedAt,
      categoryId: params.categoryId,
      itemName: params.itemName,
      amountCents: params.amountCents,
      currencyCode: params.currencyCode,
      expenseDate: params.expenseDate,
      participantIds: params.participantIds,
      payers: params.payers,
    });
    await enqueue(
      expenseOutboxEntry(
        Crypto.randomUUID(),
        "expense.update",
        groupId,
        payload,
        params.itemName.trim(),
        params.amountCents,
        params.expenseId,
      ),
    );
    return {
      data: makeLocalExpense({ id: params.expenseId, groupId, ...params }),
      error: null,
    };
  }
  return updateExpense(params);
}

export function useUpdateExpense(groupId: string) {
  const invalidate = useExpenseMutationInvalidations(groupId);
  const { enqueue } = useOutbox();
  return useMutation({
    mutationFn: (params: UpdateExpenseParams) => updateExpenseOrQueue(groupId, params, enqueue),
    onSuccess: invalidate,
  });
}

export async function updateExpenseCustomSplitOrQueue(
  groupId: string,
  params: UpdateExpenseCustomSplitParams,
  enqueue: EnqueueFn,
): Promise<ApiResponse<Expense>> {
  if (!onlineManager.isOnline()) {
    if (!params.itemName.trim()) return { data: null, error: "Item name is required" };
    if (params.amountCents <= 0) return { data: null, error: "Amount must be positive" };
    const payload = buildUpdateCustomExpenseRpcInput({
      notes: params.notes,
      expenseId: params.expenseId,
      expectedUpdatedAt: params.expectedUpdatedAt,
      categoryId: params.categoryId,
      itemName: params.itemName,
      amountCents: params.amountCents,
      currencyCode: params.currencyCode,
      expenseDate: params.expenseDate,
      customSplits: params.customSplits,
      payers: params.payers,
    });
    await enqueue(
      expenseOutboxEntry(
        Crypto.randomUUID(),
        "expense.update",
        groupId,
        payload,
        params.itemName.trim(),
        params.amountCents,
        params.expenseId,
      ),
    );
    return {
      data: makeLocalExpense({ id: params.expenseId, groupId, ...params }),
      error: null,
    };
  }
  return updateExpenseCustomSplit(params);
}

export function useUpdateExpenseCustomSplit(groupId: string) {
  const invalidate = useExpenseMutationInvalidations(groupId);
  const { enqueue } = useOutbox();
  return useMutation({
    mutationFn: (params: UpdateExpenseCustomSplitParams) => updateExpenseCustomSplitOrQueue(groupId, params, enqueue),
    onSuccess: invalidate,
  });
}

export async function updateItemizedExpenseOrQueue(
  groupId: string,
  params: UpdateItemizedExpenseParams,
  enqueue: EnqueueFn,
): Promise<ApiResponse<Expense>> {
  if (!onlineManager.isOnline()) {
    if (!params.expenseName.trim()) return { data: null, error: "Expense name is required" };
    if (params.amountCents <= 0) return { data: null, error: "Amount must be positive" };
    if (params.lineItems.length === 0)
      return { data: null, error: "At least one line item is required" };
    const payload = buildUpdateItemizedExpenseRpcInput({
      notes: params.notes,
      expenseId: params.expenseId,
      expectedUpdatedAt: params.expectedUpdatedAt,
      categoryId: params.categoryId,
      itemName: params.expenseName,
      amountCents: params.amountCents,
      currencyCode: params.currencyCode,
      expenseDate: params.expenseDate,
      payers: params.payers,
      lineItems: params.lineItems,
    });
    await enqueue(
      expenseOutboxEntry(
        Crypto.randomUUID(),
        "expense.update_itemized",
        groupId,
        payload,
        params.expenseName.trim(),
        params.amountCents,
        params.expenseId,
      ),
    );
    return {
      data: makeLocalExpense({
        id: params.expenseId,
        groupId,
        itemName: params.expenseName,
        ...params,
      }),
      error: null,
    };
  }
  return updateItemizedExpense(params);
}

export function useUpdateItemizedExpense(groupId: string) {
  const invalidate = useExpenseMutationInvalidations(groupId);
  const { enqueue } = useOutbox();
  return useMutation({
    mutationFn: (params: UpdateItemizedExpenseParams) => updateItemizedExpenseOrQueue(groupId, params, enqueue),
    onSuccess: invalidate,
  });
}

export async function deleteExpenseOrQueue(
  groupId: string,
  expenseId: string,
  enqueue: EnqueueFn,
): Promise<ApiResponse<null>> {
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
}

export function useDeleteExpense(groupId: string) {
  const invalidate = useExpenseMutationInvalidations(groupId);
  const { enqueue } = useOutbox();
  return useMutation({
    mutationFn: (expenseId: string) => deleteExpenseOrQueue(groupId, expenseId, enqueue),
    onSuccess: invalidate,
  });
}
