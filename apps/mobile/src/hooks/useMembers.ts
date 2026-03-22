import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMember, addMembersBatch, deleteMember, listMembers } from "@/services/members";


export function useMembers(groupId: string) {
  return useQuery({
    queryKey: ["members", groupId],
    queryFn: () => listMembers(groupId),
    enabled: !!groupId,
    select: (res) => res.data ?? [],
  });
}

export function useAddMember(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => addMember(groupId, name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["members", groupId] });
      void qc.invalidateQueries({ queryKey: ["balances", groupId] });
    },
  });
}

export function useAddMembersBatch(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (names: string[]) => addMembersBatch(groupId, names),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["members", groupId] });
      void qc.invalidateQueries({ queryKey: ["balances", groupId] });
    },
  });
}

export function useDeleteMember(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => deleteMember(memberId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["members", groupId] });
      void qc.invalidateQueries({ queryKey: ["balances", groupId] });
    },
  });
}
