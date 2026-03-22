import { useQuery } from "@tanstack/react-query";
import { getMembersWithBalances } from "@/services/balances";

export function useMembersWithBalances(groupId: string) {
  return useQuery({
    queryKey: ["balances", groupId],
    queryFn: () => getMembersWithBalances(groupId),
    enabled: !!groupId,
    select: (res) => res.data ?? [],
  });
}
