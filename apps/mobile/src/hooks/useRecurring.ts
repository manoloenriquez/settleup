import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRecurringExpense,
  deleteRecurringExpense,
  listRecurringExpenses,
  setRecurringExpenseActive,
  type CreateRecurringParams,
} from "@/services/recurring";

export function useRecurringExpenses(groupId: string) {
  return useQuery({
    queryKey: ["recurring", groupId],
    queryFn: () => listRecurringExpenses(groupId),
    enabled: !!groupId,
    select: (res) => res.data ?? [],
  });
}

export function useCreateRecurringExpense(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateRecurringParams) => createRecurringExpense(params),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["recurring", groupId] });
    },
  });
}

export function useSetRecurringActive(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; active: boolean }) =>
      setRecurringExpenseActive(params.id, params.active),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["recurring", groupId] });
    },
  });
}

export function useDeleteRecurringExpense(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRecurringExpense(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["recurring", groupId] });
    },
  });
}
