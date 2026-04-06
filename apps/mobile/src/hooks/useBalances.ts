import { useQuery } from "@tanstack/react-query";
import { getMembersWithBalances, getCreditorProfiles } from "@/services/balances";

export function useMembersWithBalances(groupId: string) {
  return useQuery({
    queryKey: ["balances", groupId],
    queryFn: () => getMembersWithBalances(groupId),
    enabled: !!groupId,
    select: (res) => res.data ?? [],
  });
}

export function useCreditorProfiles(groupId: string) {
  return useQuery({
    queryKey: ["creditor-profiles", groupId],
    queryFn: () => getCreditorProfiles(groupId),
    enabled: !!groupId,
    select: (res) => res.data ?? [],
  });
}
