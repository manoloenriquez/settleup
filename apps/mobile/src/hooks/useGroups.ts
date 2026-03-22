import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createGroup, deleteGroup, listGroupsWithStats } from "@/services/groups";
import { useAuth } from "@/context/AuthContext";

export function useGroupsWithStats() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["groups"],
    queryFn: () => listGroupsWithStats(session!.user.id),
    enabled: !!session,
    select: (res) => res.data ?? [],
  });
}

export function useCreateGroup() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createGroup(name, session!.user.id),
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
