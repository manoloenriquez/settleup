import { useQuery } from "@tanstack/react-query";
import { getDashboardSummary } from "@/services/dashboard";
import { useAuth } from "@/context/AuthContext";

export function useDashboardSummary() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await getDashboardSummary();
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    enabled: !!session,
  });
}
