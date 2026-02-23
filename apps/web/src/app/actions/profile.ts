"use server";

import { createClient } from "@/lib/supabase/server";
import { assertAuth, assertAdmin, AuthError } from "@/lib/supabase/guards";
import type { ApiResponse } from "@template/shared";
import type { Profile, ProfileUpdate, UserRole } from "@template/supabase";

export async function getMyProfile(): Promise<ApiResponse<Profile>> {
  try {
    const user = await assertAuth();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error || !data) return { data: null, error: error?.message ?? "Profile not found." };
    return { data, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

export async function updateMyProfile(
  update: Pick<ProfileUpdate, "full_name">,
): Promise<ApiResponse<Profile>> {
  try {
    const user = await assertAuth();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("profiles")
      .update(update)
      .eq("id", user.id)
      .select()
      .single();

    if (error || !data) return { data: null, error: error?.message ?? "Update failed." };
    return { data, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Admin-only: update any user's role
// ---------------------------------------------------------------------------

export async function adminSetRole(
  targetUserId: string,
  newRole: UserRole,
): Promise<ApiResponse<void>> {
  try {
    await assertAdmin(); // throws if not admin
    const supabase = await createClient();

    const { error } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", targetUserId);

    if (error) return { data: null, error: error.message };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Admin-only: list all profiles
// ---------------------------------------------------------------------------

export async function adminListProfiles(): Promise<ApiResponse<Profile[]>> {
  try {
    await assertAdmin();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return { data: null, error: error.message };
    return { data: data ?? [], error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}
