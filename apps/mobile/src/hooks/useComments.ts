import { onlineManager, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import type { ApiResponse } from "@template/shared";
import { useOutbox } from "@/context/OutboxContext";
import { addExpenseComment, deleteExpenseComment, listExpenseComments, type ExpenseComment } from "@/services/comments";

export function useExpenseComments(expenseId: string | null) {
  return useQuery({
    queryKey: ["comments", expenseId],
    queryFn: () => listExpenseComments(expenseId!),
    enabled: expenseId !== null,
    select: (res) => res.data ?? [],
  });
}

export function useAddExpenseComment(expenseId: string | null, groupId?: string) {
  const qc = useQueryClient();
  const { enqueue } = useOutbox();
  return useMutation({
    mutationFn: async (params: { authorUserId: string; body: string }): Promise<ApiResponse<ExpenseComment>> => {
      // Offline: queue a direct insert with a client-supplied primary key; a
      // replay hits the unique constraint (23505) which the sync engine
      // treats as already-applied.
      if (groupId && !onlineManager.isOnline()) {
        const body = params.body.trim();
        if (!body) return { data: null, error: "Comment cannot be empty" };
        const clientId = Crypto.randomUUID();
        await enqueue({
          id: clientId,
          kind: "comment.create",
          entityId: clientId,
          groupId,
          payload: { expense_id: expenseId!, author_user_id: params.authorUserId, body },
          createdAt: new Date().toISOString(),
          summary: { title: body.slice(0, 40), amountCents: 0 },
        });
        return {
          data: {
            id: clientId,
            expense_id: expenseId!,
            author_user_id: params.authorUserId,
            body,
            created_at: new Date().toISOString(),
          },
          error: null,
        };
      }
      return addExpenseComment({ expenseId: expenseId!, ...params });
    },
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
