import { supabase } from "@/lib/supabase";
import type { ApiResponse } from "@template/shared";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
};

export async function getMyProfile(userId: string): Promise<ApiResponse<Profile>> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !data) return { data: null, error: error?.message ?? "Profile not found" };
  return { data: data as Profile, error: null };
}

export async function updateMyProfile(userId: string, updates: { full_name?: string }): Promise<ApiResponse<Profile>> {
  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select()
    .single();

  if (error || !data) return { data: null, error: error?.message ?? "Failed to update profile" };
  return { data: data as Profile, error: null };
}
