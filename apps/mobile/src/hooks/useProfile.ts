import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMyProfile, updateMyProfile } from "@/services/profile";
import { useAuth } from "@/context/AuthContext";

export function useProfile() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["profile", session?.user.id],
    queryFn: () => getMyProfile(session!.user.id),
    enabled: !!session,
    select: (res) => res.data,
  });
}

export function useUpdateProfile() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: { full_name?: string }) =>
      updateMyProfile(session!.user.id, updates),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["profile", session?.user.id] });
    },
  });
}
