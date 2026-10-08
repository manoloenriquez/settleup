import { useQuery } from "@tanstack/react-query";
import { getGroupOverviews } from "@/services/overview";

/** The shared-page payload per currency, default currency first. */
export function useGroupOverviews(shareToken: string | undefined) {
  return useQuery({
    queryKey: ["group-overview", shareToken],
    queryFn: () => getGroupOverviews(shareToken!),
    enabled: !!shareToken,
    select: (res) => res.data ?? null,
  });
}
