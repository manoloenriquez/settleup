import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createGroup, deleteGroup, listGroupsWithStats } from "@/services/groups";
import { useAuth } from "@/context/AuthContext";

export function useGroupsWithStats() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["groups"],
    queryFn: () => listGroupsWithStats(),
    enabled: !!session,
    select: (res) => res.data ?? [],
  });
}

// Alias for convenience (same data)
export const useGroups = useGroupsWithStats;

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createGroup(name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["groups"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => deleteGroup(groupId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["groups"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
