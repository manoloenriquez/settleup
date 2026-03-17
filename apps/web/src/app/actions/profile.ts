"use server";

import { createClient } from "@/lib/supabase/server";
import { assertAuth, assertAdmin, AuthError } from "@/lib/supabase/guards";
import type { ApiResponse } from "@template/shared";
import type { Profile, ProfileUpdate, UserRole } from "@template/supabase";
import { z } from "zod";

const adminSetRoleSchema = z.object({
  targetUserId: z.string().uuid("Invalid user ID."),
  newRole: z.enum(["user", "admin"]),
});

// 1B: whitelist only full_name — prevents writing unexpected columns
const updateMyProfileSchema = z.object({
  full_name: z.string().min(1, "Name is required.").max(100, "Name too long.").trim(),
});

export async function getMyProfile(): Promise<ApiResponse<Profile>> {
  try {
    const user = await assertAuth();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error || !data) return { data: null, error: "Profile not found." };
    return { data, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function updateMyProfile(
  update: Pick<ProfileUpdate, "full_name">,
): Promise<ApiResponse<Profile>> {
  try {
    const user = await assertAuth();

    const parsed = updateMyProfileSchema.safeParse(update);
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("profiles")
      .update({ full_name: parsed.data.full_name })
      .eq("id", user.id)
      .select()
      .single();

    if (error || !data) return { data: null, error: "Update failed." };
    return { data, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
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
    const parsed = adminSetRoleSchema.safeParse({ targetUserId, newRole });
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };

    await assertAdmin(); // throws if not admin
    const supabase = await createClient();

    const { error } = await supabase
      .from("profiles")
      .update({ role: parsed.data.newRole })
      .eq("id", parsed.data.targetUserId);

    if (error) return { data: null, error: "Failed to update role." };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
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

    if (error) return { data: null, error: "Failed to load profiles." };
    return { data: data ?? [], error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}
