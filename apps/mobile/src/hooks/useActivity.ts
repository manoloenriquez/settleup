import { useQuery } from "@tanstack/react-query";
import { getGroupActivity } from "@/services/activity";

export function useGroupActivity(groupId: string) {
  return useQuery({
    queryKey: ["activity", groupId],
    queryFn: async () => {
      const res = await getGroupActivity(groupId);
      if (res.error) throw new Error(res.error);
      return res.data ?? [];
    },
    enabled: !!groupId,
  });
}
