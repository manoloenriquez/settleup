"use server";

import { createClient } from "@/lib/supabase/server";
import { createSettleUpDb } from "@/lib/supabase/settleup";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { upsertPaymentProfileSchema } from "@template/shared";
import { uploadQRImage } from "@/lib/supabase/storage";
import type { ApiResponse } from "@template/shared";
import type { UserPaymentProfile } from "@template/supabase";

export async function getPaymentProfile(): Promise<ApiResponse<UserPaymentProfile | null>> {
  try {
    const user = await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const { data, error } = await db
      .from("user_payment_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return { data: null, error: error.message };
    return { data: data ?? null, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

export async function upsertPaymentProfile(
  input: unknown,
): Promise<ApiResponse<UserPaymentProfile>> {
  try {
    const user = await assertAuth();

    const parsed = upsertPaymentProfileSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const { data, error } = await db
      .from("user_payment_profiles")
      .upsert({ ...parsed.data, user_id: user.id, updated_at: new Date().toISOString() })
      .select()
      .single();

    if (error || !data) {
      return { data: null, error: error?.message ?? "Failed to save payment profile." };
    }
    return { data, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

export async function uploadQRImageAction(
  type: "gcash" | "bank",
  formData: FormData,
): Promise<ApiResponse<string>> {
  try {
    const user = await assertAuth();

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { data: null, error: "No file provided." };
    }

    const supabase = await createClient();
    const publicUrl = await uploadQRImage(supabase, user.id, type, file);

    // Update the user_payment_profiles URL field
    const field = type === "gcash" ? "gcash_qr_url" : "bank_qr_url";
    const settleUpSupabase = await createSettleUpDb();
    const db = settleUpSupabase.schema("settleup");
    const { error } = await db
      .from("user_payment_profiles")
      .upsert({ user_id: user.id, [field]: publicUrl, updated_at: new Date().toISOString() });

    if (error) return { data: null, error: error.message };
    return { data: publicUrl, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    if (e instanceof Error) return { data: null, error: e.message };
    throw e;
  }
}
