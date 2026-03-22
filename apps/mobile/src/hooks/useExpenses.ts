import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addExpense, deleteExpense, listExpenses } from "@/services/expenses";

type AddExpenseParams = {
  groupId: string;
  itemName: string;
  amountCents: number;
  memberIds: string[];
  payerMemberId: string;
  createdByUserId: string;
};

export function useExpenses(groupId: string) {
  return useQuery({
    queryKey: ["expenses", groupId],
    queryFn: () => listExpenses(groupId),
    enabled: !!groupId,
    select: (res) => res.data ?? [],
  });
}

export function useAddExpense(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: AddExpenseParams) => addExpense(params),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["expenses", groupId] });
      void qc.invalidateQueries({ queryKey: ["balances", groupId] });
      void qc.invalidateQueries({ queryKey: ["activity", groupId] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteExpense(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (expenseId: string) => deleteExpense(expenseId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["expenses", groupId] });
      void qc.invalidateQueries({ queryKey: ["balances", groupId] });
      void qc.invalidateQueries({ queryKey: ["activity", groupId] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
