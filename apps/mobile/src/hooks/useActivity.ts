import { useQuery } from "@tanstack/react-query";
import { getGroupActivity, getRecentActivity } from "@/services/activity";

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

export function useRecentActivity(limit = 10) {
  return useQuery({
    queryKey: ["activity", "recent", limit],
    queryFn: async () => {
      const res = await getRecentActivity(limit);
      if (res.error) throw new Error(res.error);
      return res.data ?? [];
    },
  });
}
