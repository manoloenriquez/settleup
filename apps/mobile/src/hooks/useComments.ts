import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addExpenseComment, deleteExpenseComment, listExpenseComments } from "@/services/comments";

export function useExpenseComments(expenseId: string | null) {
  return useQuery({
    queryKey: ["comments", expenseId],
    queryFn: () => listExpenseComments(expenseId!),
    enabled: expenseId !== null,
    select: (res) => res.data ?? [],
  });
}

export function useAddExpenseComment(expenseId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { authorUserId: string; body: string }) =>
      addExpenseComment({ expenseId: expenseId!, ...params }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["comments", expenseId] });
    },
  });
}

export function useDeleteExpenseComment(expenseId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => deleteExpenseComment(commentId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["comments", expenseId] });
    },
  });
}
