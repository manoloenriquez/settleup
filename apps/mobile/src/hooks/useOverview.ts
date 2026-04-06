import { useQuery } from "@tanstack/react-query";
import { getGroupOverview } from "@/services/overview";

export function useGroupOverview(shareToken: string | undefined) {
  return useQuery({
    queryKey: ["group-overview", shareToken],
    queryFn: () => getGroupOverview(shareToken!),
    enabled: !!shareToken,
    select: (res) => res.data ?? null,
  });
}
