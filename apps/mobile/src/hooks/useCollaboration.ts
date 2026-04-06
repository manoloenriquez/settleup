import { useMutation, useQueryClient } from "@tanstack/react-query";
import { joinGroupByInvite, claimMember, leaveGroup, rotateShareToken, regenerateInviteCode } from "@/services/collaboration";

export function useJoinGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteCode: string) => joinGroupByInvite(inviteCode),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}

export function useClaimMember(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => claimMember(memberId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["members", groupId] });
    },
  });
}

export function useRotateShareToken(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => rotateShareToken(memberId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["members", groupId] });
      void queryClient.invalidateQueries({ queryKey: ["balances", groupId] });
    },
  });
}

export function useLeaveGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => leaveGroup(groupId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}

export function useRegenerateInviteCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => regenerateInviteCode(groupId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}
