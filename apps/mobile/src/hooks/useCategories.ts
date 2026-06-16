import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createExpenseCategory, deleteExpenseCategory, listExpenseCategories, updateExpenseCategory } from "@/services/categories";

export function useCategories(groupId: string) {
  return useQuery({
    queryKey: ["categories", groupId],
    queryFn: async () => {
      const res = await listExpenseCategories(groupId);
      if (res.error) throw new Error(res.error);
      return res.data ?? [];
    },
    enabled: !!groupId,
  });
}

export function useCreateCategory(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { name: string; color: string }) => createExpenseCategory({ groupId, ...params }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["categories", groupId] });
    },
  });
}

export function useUpdateCategory(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { categoryId: string; name: string; icon: string; color: string; sortOrder: number }) => updateExpenseCategory(params),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["categories", groupId] });
      void qc.invalidateQueries({ queryKey: ["expenses", groupId] });
      void qc.invalidateQueries({ queryKey: ["activity", groupId] });
      void qc.invalidateQueries({ queryKey: ["insights", groupId] });
    },
  });
}

export function useDeleteCategory(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) => deleteExpenseCategory(categoryId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["categories", groupId] });
      void qc.invalidateQueries({ queryKey: ["expenses", groupId] });
      void qc.invalidateQueries({ queryKey: ["activity", groupId] });
      void qc.invalidateQueries({ queryKey: ["insights", groupId] });
    },
  });
}
