import { useQuery } from "@tanstack/react-query";
import { getDashboardSummary } from "@/services/dashboard";
import { useAuth } from "@/context/AuthContext";

export function useDashboardSummary() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => getDashboardSummary(session!.user.id),
    enabled: !!session,
    select: (res) => res.data,
  });
}
