import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * The group's shared summary link as it is now: turning the link off or
 * making a new one changes the token, so share from this, not from a cached
 * group row.
 */
export function useShareLink(groupId: string) {
  return useQuery({
    queryKey: ["share-link", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .schema("settleup")
        .from("groups")
        .select("share_token, share_enabled")
        .eq("id", groupId)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}
