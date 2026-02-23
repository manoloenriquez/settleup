"use server";

import { createClient } from "@/lib/supabase/server";
import { assertAdmin, AuthError } from "@/lib/supabase/guards";
import type { ApiResponse } from "@template/shared";
import type { Waitlist } from "@template/supabase";
import { z } from "zod";

const joinSchema = z.object({
  email: z.string().trim().email("Invalid email address").toLowerCase(),
});

// Anyone — including unauthenticated visitors — can submit the waitlist form.
export async function joinWaitlist(
  _: unknown,
  formData: FormData,
): Promise<ApiResponse<void>> {
  const parsed = joinSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid email." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("waitlist")
    .insert({ email: parsed.data.email });

  if (error) {
    // Unique constraint — already on the list
    if (error.code === "23505") return { data: null, error: "You're already on the list!" };
    return { data: null, error: "Something went wrong. Please try again." };
  }

  return { data: undefined, error: null };
}

// ---------------------------------------------------------------------------
// Admin-only actions
// ---------------------------------------------------------------------------

export async function adminListWaitlist(): Promise<ApiResponse<Waitlist[]>> {
  try {
    await assertAdmin();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("waitlist")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) return { data: null, error: error.message };
    return { data: data ?? [], error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

export async function adminApproveWaitlist(id: string): Promise<ApiResponse<void>> {
  try {
    const { user } = await assertAdmin();
    const supabase = await createClient();

    const { error } = await supabase
      .from("waitlist")
      .update({ approved: true, approved_by: user.id })
      .eq("id", id);

    if (error) return { data: null, error: error.message };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

export async function adminDeleteWaitlistEntry(id: string): Promise<ApiResponse<void>> {
  try {
    await assertAdmin();
    const supabase = await createClient();

    const { error } = await supabase.from("waitlist").delete().eq("id", id);
    if (error) return { data: null, error: error.message };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}
