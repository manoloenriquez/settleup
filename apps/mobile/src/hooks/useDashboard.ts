import { useQuery } from "@tanstack/react-query";
import { getDashboardSummaries } from "@/services/dashboard";
import { useAuth } from "@/context/AuthContext";

/** One summary per currency used in my groups. */
export function useDashboardSummaries() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await getDashboardSummaries();
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    enabled: !!session,
  });
}
