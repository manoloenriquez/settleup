import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addExpense, addExpenseCustomSplit, addItemizedExpense, deleteExpense, listExpenses, updateExpense, updateExpenseCustomSplit, updateItemizedExpense } from "@/services/expenses";

type AddExpenseParams = {
  groupId: string;
  itemName: string;
  amountCents: number;
  categoryId?: string | null;
  memberIds: string[];
  payerMemberId: string;
  createdByUserId: string;
};

type AddExpenseCustomSplitParams = {
  groupId: string;
  itemName: string;
  amountCents: number;
  categoryId?: string | null;
  customSplits: { memberId: string; shareCents: number }[];
  payers: { memberId: string; paidCents: number }[];
};

type AddItemizedExpenseParams = {
  groupId: string;
  expenseName: string;
  amountCents: number;
  categoryId?: string | null;
  payers: { memberId: string; paidCents: number }[];
  lineItems: { name: string; amountCents: number; participantIds: string[] }[];
};

export function useExpenses(groupId: string) {
  return useQuery({
    queryKey: ["expenses", groupId],
    queryFn: async () => {
      const res = await listExpenses(groupId);
      if (res.error) throw new Error(res.error);
      return res.data ?? [];
    },
    enabled: !!groupId,
  });
}

function useExpenseMutationInvalidations(groupId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["expenses", groupId] });
    void qc.invalidateQueries({ queryKey: ["balances", groupId] });
    void qc.invalidateQueries({ queryKey: ["activity", groupId] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
    void qc.invalidateQueries({ queryKey: ["groups"] });
  };
}

export function useAddExpense(groupId: string) {
  const invalidate = useExpenseMutationInvalidations(groupId);
  return useMutation({
    mutationFn: (params: AddExpenseParams) => addExpense(params),
    onSuccess: invalidate,
  });
}

export function useAddExpenseCustomSplit(groupId: string) {
  const invalidate = useExpenseMutationInvalidations(groupId);
  return useMutation({
    mutationFn: (params: AddExpenseCustomSplitParams) => addExpenseCustomSplit(params),
    onSuccess: invalidate,
  });
}

export function useAddItemizedExpense(groupId: string) {
  const invalidate = useExpenseMutationInvalidations(groupId);
  return useMutation({
    mutationFn: (params: AddItemizedExpenseParams) => addItemizedExpense(params),
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
