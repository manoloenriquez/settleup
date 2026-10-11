import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { listFriends } from "@/services/friends";

export function useFriends() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["friends"],
    queryFn: async () => {
      const res = await listFriends();
      if (res.error) throw new Error(res.error);
      return res.data ?? [];
    },
    enabled: !!session,
  });
}
