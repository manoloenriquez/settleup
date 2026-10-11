"use server";

import { createClient } from "@/lib/supabase/server";
import { createSettleUpDb } from "@/lib/supabase/settleup";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { cachedAuth } from "@/lib/supabase/queries";
import { MAX_QR_FILE_SIZE_BYTES, QR_ALLOWED_MIME_TYPES, QR_BUCKET, qrStoragePath, upsertPaymentProfileSchema } from "@template/shared";
import { uploadQRImage } from "@/lib/supabase/storage";
import type { ApiResponse } from "@template/shared";
import type { UserPaymentProfile } from "@template/supabase";
import { z } from "zod";

const uploadTypeSchema = z.enum(["gcash", "bank"]);
const QR_TYPES = new Set(QR_ALLOWED_MIME_TYPES);

export async function getPaymentProfile(): Promise<ApiResponse<UserPaymentProfile | null>> {
  try {
    const user = await cachedAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const { data, error } = await db
      .from("user_payment_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return { data: null, error: "Failed to load payment profile." };
    return { data: data ?? null, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
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
      return { data: null, error: "Failed to save payment profile." };
    }
    return { data, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function uploadQRImageAction(
  type: "gcash" | "bank",
  formData: FormData,
): Promise<ApiResponse<string>> {
  try {
    const parsedType = uploadTypeSchema.safeParse(type);
    if (!parsedType.success) return { data: null, error: "Invalid upload type." };

    const user = await assertAuth();

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { data: null, error: "No file provided." };
    }
    if (!QR_TYPES.has(file.type)) {
      return { data: null, error: "Unsupported file type. Use JPEG, PNG, or WebP." };
    }
    if (file.size > MAX_QR_FILE_SIZE_BYTES) {
      return { data: null, error: `File too large. Max ${MAX_QR_FILE_SIZE_BYTES / 1024 / 1024}MB.` };
    }

    const supabase = await createClient();
    const publicUrl = await uploadQRImage(supabase, user.id, parsedType.data, file);

    // Update the user_payment_profiles URL field
    const field = parsedType.data === "gcash" ? "gcash_qr_url" : "bank_qr_url";
    const settleUpSupabase = await createSettleUpDb();
    const db = settleUpSupabase.schema("settleup");
    const { data: previous } = await db
      .from("user_payment_profiles")
      .select("gcash_qr_url, bank_qr_url")
      .eq("user_id", user.id)
      .maybeSingle();
    const { error } = await db
      .from("user_payment_profiles")
      .upsert({ user_id: user.id, [field]: publicUrl, updated_at: new Date().toISOString() });

    if (error) {
      // The new file is not referenced anywhere; don't leave it public.
      const orphan = qrStoragePath(publicUrl, user.id);
      if (orphan) await supabase.storage.from(QR_BUCKET).remove([orphan]);
      return { data: null, error: "Failed to save QR image URL." };
    }
    // The replaced image would otherwise stay public forever.
    const replaced = qrStoragePath(previous?.[field], user.id);
    if (replaced && replaced !== qrStoragePath(publicUrl, user.id)) {
      await supabase.storage.from(QR_BUCKET).remove([replaced]);
    }
    return { data: publicUrl, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Failed to upload QR image." };
  }
}

/** Remove a QR image: clear it from the profile, then delete the public file. */
export async function removeQRImageAction(type: "gcash" | "bank"): Promise<ApiResponse<null>> {
  try {
    const parsedType = uploadTypeSchema.safeParse(type);
    if (!parsedType.success) return { data: null, error: "Invalid QR type." };

    const user = await assertAuth();
    const field = parsedType.data === "gcash" ? "gcash_qr_url" : "bank_qr_url";
    const settleUpSupabase = await createSettleUpDb();
    const db = settleUpSupabase.schema("settleup");
    const { data: previous } = await db
      .from("user_payment_profiles")
      .select("gcash_qr_url, bank_qr_url")
      .eq("user_id", user.id)
      .maybeSingle();
    const { error } = await db
      .from("user_payment_profiles")
      .update({ [field]: null, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
    if (error) return { data: null, error: "Failed to remove QR image." };

    const path = qrStoragePath(previous?.[field], user.id);
    if (path) {
      const supabase = await createClient();
      await supabase.storage.from(QR_BUCKET).remove([path]);
    }
    return { data: null, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Failed to remove QR image." };
  }
}
