import { track } from "@/lib/analytics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMember, addMembersBatch, deleteMember, listMembers, renameMember } from "@/services/members";


export function useMembers(groupId: string) {
  return useQuery({
    queryKey: ["members", groupId],
    queryFn: async () => {
      const res = await listMembers(groupId);
      if (res.error) throw new Error(res.error);
      return res.data ?? [];
    },
    enabled: !!groupId,
  });
}

export function useAddMember(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => addMember(groupId, name),
    onSuccess: (result) => {
      if (result.data) track({ name: "member_added" });
      void qc.invalidateQueries({ queryKey: ["members", groupId] });
      void qc.invalidateQueries({ queryKey: ["balances", groupId] });
      void qc.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}

export function useAddMembersBatch(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (names: string[]) => addMembersBatch(groupId, names),
    onSuccess: (result) => {
      const added = Array.isArray(result.data) ? result.data.length : 0;
      for (let i = 0; i < added; i++) track({ name: "member_added" });
      void qc.invalidateQueries({ queryKey: ["members", groupId] });
      void qc.invalidateQueries({ queryKey: ["balances", groupId] });
      void qc.invalidateQueries({ queryKey: ["groups"] });
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
      void qc.invalidateQueries({ queryKey: ["groups"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useRenameMember(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, newName }: { memberId: string; newName: string }) =>
      renameMember(memberId, newName),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["members", groupId] });
      void qc.invalidateQueries({ queryKey: ["balances", groupId] });
      void qc.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}
