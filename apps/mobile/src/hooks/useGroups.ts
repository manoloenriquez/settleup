import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { archiveGroup, createGroup, deleteGroup, listArchivedGroups, listGroupsWithStats, renameGroup, restoreGroup, transferOwnership } from "@/services/groups";

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

export function useArchiveGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => archiveGroup(groupId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["groups"] });
      void qc.invalidateQueries({ queryKey: ["archivedGroups"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useArchivedGroups() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["archivedGroups"],
    queryFn: () => listArchivedGroups(),
    enabled: !!session,
    select: (res) => res.data ?? [],
  });
}

export function useRestoreGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => restoreGroup(groupId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["groups"] });
      void qc.invalidateQueries({ queryKey: ["archivedGroups"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useTransferOwnership() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, memberId }: { groupId: string; memberId: string }) =>
      transferOwnership(groupId, memberId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["groups"] });
      void qc.invalidateQueries({ queryKey: ["members"] });
    },
  });
}

export function useRenameGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, name }: { groupId: string; name: string }) =>
      renameGroup(groupId, name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}
