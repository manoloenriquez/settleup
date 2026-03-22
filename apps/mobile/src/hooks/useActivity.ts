import { useQuery } from "@tanstack/react-query";
import { getGroupActivity } from "@/services/activity";

export function useGroupActivity(groupId: string) {
  return useQuery({
    queryKey: ["activity", groupId],
    queryFn: () => getGroupActivity(groupId),
    enabled: !!groupId,
    select: (res) => res.data ?? [],
  });
}
