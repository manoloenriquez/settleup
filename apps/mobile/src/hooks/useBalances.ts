import { useQuery } from "@tanstack/react-query";
import { getMembersWithBalances, getCreditorProfiles } from "@/services/balances";

export function useMembersWithBalances(groupId: string) {
  return useQuery({
    queryKey: ["balances", groupId],
    queryFn: async () => {
      const res = await getMembersWithBalances(groupId);
      if (res.error) throw new Error(res.error);
      return res.data ?? [];
    },
    enabled: !!groupId,
  });
}

export function useCreditorProfiles(groupId: string) {
  return useQuery({
    queryKey: ["creditor-profiles", groupId],
    queryFn: async () => {
      const res = await getCreditorProfiles(groupId);
      if (res.error) throw new Error(res.error);
      return res.data ?? [];
    },
    enabled: !!groupId,
  });
}
