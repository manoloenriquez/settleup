import { onlineManager, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import type { ExpenseCategory } from "@template/supabase";
import { createExpenseCategory, deleteExpenseCategory, listExpenseCategories, updateExpenseCategory } from "@/services/categories";
import { useOutbox } from "@/context/OutboxContext";

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
  const { enqueue } = useOutbox();
  return useMutation({
    mutationFn: async (params: { name: string; color: string }) => {
      if (!onlineManager.isOnline()) {
        // The client id doubles as the category id server-side.
        const clientId = Crypto.randomUUID();
        await enqueue({
          id: clientId,
          kind: "category.create",
          entityId: clientId,
          groupId,
          payload: { name: params.name, icon: "circle-ellipsis", color: params.color },
          createdAt: new Date().toISOString(),
          summary: { title: `Category "${params.name}"`, amountCents: 0 },
        });
        const local: ExpenseCategory = {
          id: clientId,
          group_id: groupId,
          name: params.name,
          slug: params.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          icon: "circle-ellipsis",
          color: params.color,
          sort_order: 999,
          is_default: false,
          created_by_user_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        return { data: local, error: null };
      }
      return createExpenseCategory({ groupId, ...params });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["categories", groupId] });
    },
  });
}

export function useUpdateCategory(groupId: string) {
  const qc = useQueryClient();
  const { enqueue } = useOutbox();
  return useMutation({
    mutationFn: async (params: { categoryId: string; name: string; icon: string; color: string; sortOrder: number }) => {
      if (!onlineManager.isOnline()) {
        // Coalesces with earlier queued edits of the same category.
        await enqueue({
          id: Crypto.randomUUID(),
          kind: "category.update",
          entityId: params.categoryId,
          groupId,
          payload: { name: params.name, icon: params.icon, color: params.color, sort_order: params.sortOrder },
          createdAt: new Date().toISOString(),
          summary: { title: `Category "${params.name}"`, amountCents: 0 },
        });
        return { data: null, error: null };
      }
      return updateExpenseCategory(params);
    },
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
  const { enqueue } = useOutbox();
  return useMutation({
    mutationFn: async (categoryId: string) => {
      if (!onlineManager.isOnline()) {
        // Deleting a queued offline create cancels the whole local chain.
        await enqueue({
          id: Crypto.randomUUID(),
          kind: "category.delete",
          entityId: categoryId,
          groupId,
          payload: {},
          createdAt: new Date().toISOString(),
          summary: { title: "Delete category", amountCents: 0 },
        });
        return { data: null, error: null };
      }
      return deleteExpenseCategory(categoryId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["categories", groupId] });
      void qc.invalidateQueries({ queryKey: ["expenses", groupId] });
      void qc.invalidateQueries({ queryKey: ["activity", groupId] });
      void qc.invalidateQueries({ queryKey: ["insights", groupId] });
    },
  });
}
